"""Load the parsed workbook JSON (payables_parse_workbook.py) into the ap_* tables.

Usage: python scripts/payables_import.py <parsed.json> [--replace]

Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from repo/.env. Refuses to run
when suppliers already exist unless --replace is given, which wipes every
ap_* row first (runs included) — only meant for the initial migration.

Historical payments are imported as-is; each invoice's paid part is allocated
from them oldest-first, and any shortfall is covered by one "Paiements
antérieurs (import)" payment, so every invoice opens on the tab's balance.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ENV = Path(__file__).resolve().parent.parent / '.env'


def load_env():
    env = {}
    for line in ENV.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"')
    return env


E = load_env()
BASE = E['SUPABASE_URL'].rstrip('/') + '/rest/v1'
KEY = E['SUPABASE_SERVICE_ROLE_KEY']


def call(method, path, body=None, prefer='return=representation'):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={
        'apikey': KEY, 'Authorization': f'Bearer {KEY}',
        'Content-Type': 'application/json', 'Prefer': prefer,
    })
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode('utf-8')
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{method} {path} failed: {e.code} {e.read().decode("utf-8")[:800]}')


def insert(table, rows, chunk=500):
    out = []
    for i in range(0, len(rows), chunk):
        out += call('POST', f'/{table}', rows[i:i + chunk])
    return out


def main(path, replace):
    existing = call('GET', '/ap_suppliers?select=id&limit=1')
    if existing and not replace:
        raise SystemExit('ap_suppliers is not empty — rerun with --replace to wipe and reimport.')
    if replace:
        for t in ('ap_events', 'ap_run_lines', 'ap_run_cash_lines', 'ap_payment_allocations'):
            call('DELETE', f'/{t}?id=not.is.null', prefer='return=minimal')
        call('PATCH', '/ap_invoices?origin_payment_id=not.is.null', {'origin_payment_id': None}, prefer='return=minimal')
        for t in ('ap_payments', 'ap_runs', 'ap_invoices', 'ap_suppliers'):
            call('DELETE', f'/{t}?id=not.is.null', prefer='return=minimal')

    accounts = {a['code']: a['id'] for a in call('GET', '/ap_bank_accounts?select=id,code')}
    data = json.load(open(path, encoding='utf-8'))['suppliers']

    sup_rows = [{
        'name': s['name'], 'category': s['category'], 'payment_method': s['payment_method'],
        'bank_account_id': accounts[s['account']], 'notes': s['notes'], 'sheet_tab': s['sheet_tab'],
        'sort_order': s['sort_order'],
    } for s in data]
    ids = {r['name']: r['id'] for r in insert('ap_suppliers', sup_rows)}

    skipped_credits = 0
    totals = {}
    for s in data:
        sid = ids[s['name']]
        inv_rows, opens = [], []
        for i in s['invoices']:
            kind = i.get('kind', 'invoice')
            amount, open_ = i['amount'], i['open']
            if kind == 'invoice' and amount < 0:
                if abs(open_) < 0.005:
                    skipped_credits += 1
                    continue
                kind, amount = ('credit', open_) if open_ < 0 else ('adjustment', open_)
            inv_rows.append({
                'supplier_id': sid, 'kind': kind, 'invoice_number': i.get('invoice_number'),
                'po_number': i.get('po_number'), 'invoice_date': i.get('invoice_date'),
                'amount': amount, 'description': i.get('description'), 'in_quickbooks': True,
                'source': 'import',
            })
            opens.append(open_ if kind == 'invoice' else amount)
        created = insert('ap_invoices', inv_rows) if inv_rows else []

        pays = sorted((p for p in s['payments'] if p['amount'] > 0 and p['paid_on']), key=lambda p: p['paid_on'])
        pay_rows = [{
            'supplier_id': sid, 'paid_on': p['paid_on'], 'amount': p['amount'],
            'reference': p.get('reference'), 'source': 'import',
            'bank_account_id': accounts[s['account']], 'payment_method': s['payment_method'],
        } for p in pays]
        pay_created = insert('ap_payments', pay_rows) if pay_rows else []
        pool = [[p['id'], float(p['amount'])] for p in pay_created]

        allocs = []
        need_total = 0.0
        order = sorted(range(len(created)), key=lambda k: (created[k]['invoice_date'] or '', k))
        for k in order:
            inv = created[k]
            need = round(float(inv['amount']) - opens[k], 2)
            if inv['kind'] == 'invoice' and need < 0:
                # Tab balance above the invoice amount (fees/interest added in the sheet).
                insert('ap_invoices', [{
                    'supplier_id': sid, 'kind': 'adjustment', 'invoice_number': inv['invoice_number'],
                    'invoice_date': inv['invoice_date'], 'amount': -need, 'in_quickbooks': True, 'source': 'import',
                    'description': "Ajustement — solde de l'onglet supérieur au montant de la facture",
                }])
                continue
            if inv['kind'] != 'invoice' or need <= 0:
                continue
            while need > 0.004 and pool:
                take = round(min(need, pool[0][1]), 2)
                if take > 0:
                    allocs.append({'payment_id': pool[0][0], 'invoice_id': inv['id'], 'amount': take})
                need = round(need - take, 2)
                pool[0][1] = round(pool[0][1] - take, 2)
                if pool[0][1] <= 0.004:
                    pool.pop(0)
            if need > 0.004:
                allocs.append({'_invoice': inv['id'], 'amount': need})
                need_total += need

        if need_total > 0:
            first = min((i['invoice_date'] for i in created if i['invoice_date']), default='2026-10-02')
            synth = insert('ap_payments', [{
                'supplier_id': sid, 'paid_on': first, 'amount': round(need_total, 2), 'source': 'import',
                'reference': 'Paiements antérieurs (import)',
                'notes': "Couvre les paiements que l'onglet ne détaille pas, pour que chaque facture ouvre sur son solde.",
                'bank_account_id': accounts[s['account']], 'payment_method': s['payment_method'],
            }])[0]
            for a in allocs:
                if '_invoice' in a:
                    a['invoice_id'] = a.pop('_invoice')
                    a['payment_id'] = synth['id']
        if allocs:
            insert('ap_payment_allocations', allocs)
        totals[s['name']] = s['owed']

    check = call('GET', '/ap_supplier_balances?select=supplier_id,owed')
    by_id = {r['supplier_id']: float(r['owed']) for r in check}
    bad = [(n, totals[n], by_id.get(ids[n], 0)) for n in totals if abs(totals[n] - by_id.get(ids[n], 0)) > 0.009]
    print(f'Imported {len(ids)} suppliers; skipped {skipped_credits} fully-applied credit rows.')
    print(f'Workbook total owed {sum(totals.values()):.2f} / portal total {sum(by_id.values()):.2f}')
    for n, want, got in bad:
        print(f'  MISMATCH {n}: workbook {want:.2f} portal {got:.2f}')
    if not bad:
        print('Every supplier balance matches the workbook.')


if __name__ == '__main__':
    main(sys.argv[1], '--replace' in sys.argv)
