"""Parse the "Supplier Payments" workbook into suppliers / invoices / payments.

Usage: python scripts/payables_parse_workbook.py <workbook.xlsm> <out.json>

The per-supplier tabs come in a dozen layouts, so each tab is read by finding
its header row and classifying columns by name (invoice #, date, amount,
balance, payment date/amount). Each supplier's open invoices are then
reconciled against the summary tab's "Total Owed" (column B): any difference
becomes one "adjustment" line so the portal opens on exactly the workbook's
totals, and the report lists every supplier that needed one for review.
"""
import json
import re
import sys
from datetime import date, datetime

import openpyxl

SUMMARY = 'Supplier payment summary'
OPENING_DATE = '2026-10-02'
# Tabs that aren't an invoice ledger (loan schedules, shared export sheet):
# imported as a single opening balance instead of parsed line by line.
NO_PARSE_TABS = {'DL Investissement', 'Export', 'CRA arrears'}

METHODS = {
    'eft': ('eft', 'rbc'), 'wire': ('wire', 'rbc'), 'e-transfer': ('etransfer', 'rbc'),
    'prepaid cc': ('prepaid_cc', 'rbc'), 'mjlb td': ('eft', 'td_mjlb'),
}


def num(v):
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    if isinstance(v, str):
        s = v.replace('$', '').replace(',', '').replace(' ', '').strip()
        try:
            return round(float(s), 2)
        except ValueError:
            return None
    return None


def iso(v):
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, str):
        m = re.match(r'^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$', v.strip())
        if m:
            d, mo, y = int(m[1]), int(m[2]), int(m[3])
            try:
                return date(y, mo, d).isoformat()
            except ValueError:
                return None
    return None


def text(v):
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = str(v).strip()
    return s or None


def norm(h):
    return re.sub(r'\s+', ' ', str(h).strip().lower())


def classify(h):
    h = norm(h)
    pay = bool(re.search(r'pmt|pmnt|payment|paiement|paid', h))
    if re.search(r'balance|solde|open', h):
        return 'balance'
    if pay and 'date' in h:
        return 'pay_date'
    if 'date' in h:
        return 'date'
    if pay and re.search(r'amount|\$|montant', h):
        return 'pay_amount'
    if re.fullmatch(r'payments?|pmts?|pmnts?', h):
        return 'inv_paid'
    if re.search(r'invoice \$|inv\.? amount|invoice amount|^amount$|^montant$|^total$|^inv\.? \$', h):
        return 'amount'
    if re.search(r'invoice|^inv\b|inv\.? ?#|inv number|facture|^#$', h):
        return 'invoice'
    if re.fullmatch(r'po|po ?#|po number', h):
        return 'po'
    if 'date' in h:
        return 'date'
    if re.search(r'note|description|test|comment', h):
        return 'desc'
    return None


def find_header(ws):
    best = None
    for r in range(1, 7):
        cells = [(c, ws.cell(r, c).value) for c in range(1, min(ws.max_column, 40) + 1)]
        kinds = {c: classify(v) for c, v in cells if isinstance(v, str) and v.strip()}
        score = sum(1 for k in kinds.values() if k in ('invoice', 'invoices', 'amount', 'balance', 'pay_amount', 'date'))
        if score >= 2 and (best is None or score > best[0]):
            best = (score, r, kinds, {c: norm(v) for c, v in cells if isinstance(v, str) and v.strip()})
    return best


def parse_tab(ws_v, ws_f):
    hdr = find_header(ws_v)
    if not hdr:
        return None
    _, hrow, kinds, names = hdr
    # A generic "Amount" right after a payment-date column is a payment amount,
    # and an "Invoice #" right after that is the invoice it paid, not a ledger.
    for c in sorted(kinds):
        if kinds[c] == 'amount' and kinds.get(c - 1) == 'pay_date':
            kinds[c] = 'pay_amount'
    for c in sorted(kinds):
        if kinds[c] == 'invoice' and (kinds.get(c - 1) == 'pay_amount' or kinds.get(c - 2) == 'pay_amount'):
            kinds[c] = 'pay_ref'
    # "Invoices" (plural) heads a ledger whose amount column has no header.
    for c in sorted(kinds):
        if kinds[c] == 'invoices':
            kinds[c] = 'invoice'
            if c + 1 not in kinds:
                kinds[c + 1] = 'amount'
    cols = sorted(kinds)

    def first(kind, after=0, before=10_000):
        for c in cols:
            if after < c < before and kinds[c] == kind:
                return c
        return None

    inv = first('invoice')
    amount = None
    balance = None
    if inv:
        amount = first('amount', after=inv) or first('amount')
    else:
        amount = first('amount')
    if amount is None:
        return None
    balance = first('balance', after=amount) or first('balance')
    anchor = min(c for c in (inv, amount) if c)
    inv_date = None
    for c in cols:
        if kinds[c] == 'date' and c < anchor + 1 and (inv_date is None or c > inv_date):
            if c >= anchor - 3:
                inv_date = c
    if inv_date is None:
        inv_date = first('date', after=anchor - 1, before=anchor + 4)
    po = first('po', after=anchor - 3, before=anchor + 3)
    inv_paid = first('inv_paid', after=amount, before=amount + 3)
    desc = first('desc', after=amount, before=amount + 6)

    # Payment block: explicit "pmt amount" columns, or a generic "amount" sitting
    # right after a payment-date column (Lyonleaf-style).
    pay_pairs = []
    pay_dates = [c for c in cols if kinds[c] == 'pay_date']
    pay_amounts = [c for c in cols if kinds[c] == 'pay_amount']
    used = set()
    for pa in pay_amounts:
        cand = [d for d in pay_dates if abs(d - pa) <= 2 and d not in used]
        cand += [c for c in cols if kinds[c] == 'date' and abs(c - pa) <= 1 and c not in (inv_date,) and c not in used]
        d = min(cand, key=lambda x: abs(x - pa)) if cand else None
        if d:
            used.add(d)
        pay_pairs.append((d, pa))
    for d in pay_dates:
        if d in used:
            continue
        nxt = d + 1
        if nxt in kinds and kinds[nxt] in ('amount',) and nxt != amount:
            pay_pairs.append((d, nxt))
            used.add(d)
    per_row_dates = [c for c in pay_dates if c not in used and re.match(r'pmt date \d+', names.get(c, ''))]

    invoices, payments = [], []
    ledger_open = True
    blank_run = 0
    block = [c for c in (inv, amount, balance, inv_date) if c]
    for r in range(hrow + 1, ws_v.max_row + 1):
        fa = ws_f.cell(r, amount).value
        a = num(ws_v.cell(r, amount).value)
        inv_no = text(ws_v.cell(r, inv).value) if inv else None
        labels = [str(ws_v.cell(r, c).value or '').strip().lower() for c in range(max(1, min(block) - 1), max(block) + 1)]
        is_total = (isinstance(fa, str) and fa.upper().startswith('=SUM')) or any(
            len(l) < 20 and l.startswith('total') for l in labels)
        if a is None and not is_total:
            blank_run += 1
        else:
            blank_run = 0
        # The ledger ends at its Total row or two blank rows; anything below
        # (side calculations, inventory notes) is not an invoice.
        if is_total or (blank_run >= 2 and invoices):
            ledger_open = False
        if not ledger_open:
            a = None
        if a is not None and a != 0:
            bal = num(ws_v.cell(r, balance).value) if balance else None
            if bal is None and inv_paid:
                paid = num(ws_v.cell(r, inv_paid).value) or 0
                bal = round(a - paid, 2)
            if bal is None:
                bal = a if not pay_pairs and not inv_paid else None
            row = {
                'invoice_number': inv_no,
                'po_number': text(ws_v.cell(r, po).value) if po else None,
                'invoice_date': iso(ws_v.cell(r, inv_date).value) if inv_date else None,
                'amount': a,
                'open': bal,
                'description': text(ws_v.cell(r, desc).value) if desc else None,
                'row': r,
            }
            invoices.append(row)
            if inv_paid:
                paid = num(ws_v.cell(r, inv_paid).value)
                if paid and paid > 0:
                    dates = [iso(ws_v.cell(r, c).value) for c in per_row_dates]
                    dates = [d for d in dates if d]
                    payments.append({'paid_on': max(dates) if dates else row['invoice_date'], 'amount': paid,
                                     'reference': f"Facture {inv_no}" if inv_no else None})
        for d, pa in pay_pairs:
            fpa = ws_f.cell(r, pa).value
            if isinstance(fpa, str) and fpa.upper().startswith('=SUM'):
                continue
            p = num(ws_v.cell(r, pa).value)
            pd = iso(ws_v.cell(r, d).value) if d else None
            if p and pd:
                payments.append({'paid_on': pd, 'amount': abs(p), 'reference': None})

    # Rows with no balance info: if the tab tracks payments separately, open
    # amounts are derived oldest-first from the payment total.
    if any(i['open'] is None for i in invoices):
        pool = sum(p['amount'] for p in payments)
        for i in sorted(invoices, key=lambda x: (x['invoice_date'] or '', x['row'])):
            if i['open'] is None:
                take = min(pool, i['amount']) if i['amount'] > 0 else 0
                i['open'] = round(i['amount'] - take, 2)
                pool -= take
    return {'header_row': hrow, 'invoices': invoices, 'payments': payments}


def tab_of(formula, sheetnames):
    if not isinstance(formula, str) or not formula.startswith('='):
        return None
    m = re.search(r"'([^']+)'!|([A-Za-z0-9_.\-]+)!", formula)
    if not m:
        return None
    name = m[1] or m[2]
    return name if name in sheetnames else None


def category(name):
    n = name.lower()
    if 'loan' in n or 'dl investissements' in n or 'questor' in n:
        return 'loan'
    if re.search(r'\bcra\b|revenu quebec|\brq\b|ville mtl|health canada|ircc|tax', n):
        return 'tax'
    if re.search(r'hydro|energir|telenuage|selectcom', n):
        return 'utility'
    if 'insurance' in n:
        return 'service'
    return 'supplier'


def main(path, out):
    wv = openpyxl.load_workbook(path, data_only=True, keep_vba=False)
    wf = openpyxl.load_workbook(path, data_only=False, keep_vba=False)
    sv, sf = wv[SUMMARY], wf[SUMMARY]
    names = set(wv.sheetnames)

    rows = []
    for r in range(3, 189):
        name = text(sv.cell(r, 1).value)
        if not name or name.lower() == 'total':
            continue
        rows.append(r)
    tab_refs = {}
    for r in rows:
        t = tab_of(sf.cell(r, 2).value, names)
        if t:
            tab_refs.setdefault(t, []).append(r)

    suppliers, report = [], []
    for order, r in enumerate(rows):
        name = text(sv.cell(r, 1).value)
        owed = num(sv.cell(r, 2).value) or 0.0
        method_raw = (text(sv.cell(r, 8).value) or '').lower()
        method, account = METHODS.get(method_raw, ('eft', 'rbc'))
        note = text(sv.cell(r, 9).value)
        if note and 'automatic' in note.lower():
            method = 'auto_withdrawal'
        tab = tab_of(sf.cell(r, 2).value, names)
        parsed = None
        if tab and tab not in NO_PARSE_TABS and len(tab_refs.get(tab, [])) == 1:
            parsed = parse_tab(wv[tab], wf[tab])
        invoices = parsed['invoices'] if parsed else []
        payments = parsed['payments'] if parsed else []
        open_sum = round(sum(i['open'] for i in invoices), 2)
        diff = round(owed - open_sum, 2)
        fallback = False
        # A large gap means the tab's layout wasn't read reliably: keep its
        # lines as closed history and open on the summary total instead.
        if invoices and abs(diff) > max(100.0, 0.05 * max(abs(owed), abs(open_sum))):
            for i in invoices:
                i['open'] = 0.0
            invoices = [dict(i, kind='invoice') for i in invoices]
            fallback = True
            diff = owed
        if (not invoices or fallback) and owed:
            invoices.append({'kind': 'opening_balance', 'invoice_number': None, 'po_number': None,
                             'invoice_date': OPENING_DATE, 'amount': owed, 'open': owed,
                             'description': "Solde d'ouverture (classeur Supplier Payments, 2 oct. 2026)"})
            diff = 0.0
        elif abs(diff) >= 0.01 and not fallback:
            invoices.append({'kind': 'adjustment', 'invoice_number': None, 'po_number': None,
                             'invoice_date': OPENING_DATE, 'amount': diff, 'open': diff,
                             'description': "Ajustement d'ouverture — écart entre l'onglet et le total du sommaire"})
        suppliers.append({
            'name': name, 'sheet_tab': tab, 'category': category(name),
            'payment_method': method, 'account': account, 'notes': note,
            'sort_order': order, 'owed': owed, 'invoices': invoices, 'payments': payments,
            'week': {'suggested': num(sv.cell(r, 5).value), 'suggested_text': text(sv.cell(r, 5).value) if num(sv.cell(r, 5).value) is None else None,
                     'status': text(sv.cell(r, 6).value), 'approved': num(sv.cell(r, 7).value)},
        })
        report.append((name, tab, owed, open_sum, 'FALLBACK' if fallback else diff, len(invoices), len(payments), parsed is not None))

    json.dump({'suppliers': suppliers}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for name, tab, owed, open_sum, diff, ni, np_, ok in report:
        if diff == 'FALLBACK':
            flag, shown = '  <-- OPENING BALANCE (history kept as closed)', '  fallback'
        else:
            flag, shown = ('' if abs(diff) < 0.01 else '  <-- ADJ'), f'{diff:>10.2f}'
        print(f"{name[:38]:38} | {str(tab)[:24]:24} | owed {owed:>11.2f} | tab {open_sum:>11.2f} | diff {shown} | inv {ni:3} pay {np_:3}{'' if ok else ' (no parse)'}{flag}")
    print('TOTAL owed', round(sum(s['owed'] for s in suppliers), 2))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
