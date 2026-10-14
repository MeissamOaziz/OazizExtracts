import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import { getPortailLocale, makeT } from '../../../../lib/portail-i18n';
import { frProduction, enProduction, type ProductionDict } from '../../../../i18n/portail/production';
import { csvCell, fmtDateTime, isIsoDate, roomName, todayLocal, typeName } from '../../../../lib/production';
import { defaultReportPeriod, describeChanges, loadReport, type DescribeCtx } from '../../../../lib/production-report';

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ?kind=journal → every change in the period (the audit trail)
// ?kind=ecarts  → original plan vs. reality, one line per task
export const GET: APIRoute = async ({ request, cookies, url }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return new Response('Unauthorized', { status: 401 });

  const locale = getPortailLocale(cookies);
  const T = makeT(locale, frProduction, enProduction);
  const K = (k: string) => k as keyof ProductionDict;
  const def = defaultReportPeriod(todayLocal());
  const q = (k: string) => url.searchParams.get(k);
  const from = isIsoDate(q('from')) ? q('from')! : def.from;
  const to = isIsoDate(q('to')) ? q('to')! : def.to;
  const roomId = UUID.test(q('room') ?? '') ? q('room') : null;
  const typeId = UUID.test(q('type') ?? '') ? q('type') : null;
  const kind = q('kind') === 'ecarts' ? 'ecarts' : 'journal';

  const r = await loadReport(getAdminClient(), { from, to, roomId, typeId });
  const ctx: DescribeCtx = {
    T, locale,
    rooms: new Map(r.rooms.map((x) => [x.id, x])),
    types: new Map(r.types.map((x) => [x.id, x])),
  };

  let lines: string[][];
  if (kind === 'journal') {
    lines = [
      [T('rep.col.when'), T('col.no'), T('f.type'), T('f.room'), T('rep.col.event'), T('rep.col.reason'),
        T('rep.col.note'), T('rep.col.who'), T('rep.col.what'), 'Δ ' + T('field.start_date'), 'Δ ' + T('field.end_date')],
      ...r.events.map((e) => {
        const t = r.taskById.get(e.task_id);
        return [
          fmtDateTime(e.at, locale), t?.task_no ?? '', typeName(ctx.types.get(t?.production_type_id ?? ''), locale),
          roomName(ctx.rooms.get(t?.room_id ?? ''), locale), T(K(`ev.${e.kind}`)),
          e.reason_code ? T(K(`reason.${e.reason_code}`)) : '', e.reason_note ?? '', e.staff_name ?? '',
          describeChanges(e, ctx).join(' | '),
          e.start_shift_days === null ? '' : String(e.start_shift_days),
          e.end_shift_days === null ? '' : String(e.end_shift_days),
        ];
      }),
    ];
  } else {
    lines = [
      [T('col.no'), T('f.type'), T('f.room'), T('f.status'), T('rep.col.origin'), T('f.lot'), T('f.batch'),
        `${T('rep.col.origPlan')} — ${T('field.start_date')}`, `${T('rep.col.origPlan')} — ${T('field.end_date')}`,
        `${T('rep.col.curPlan')} — ${T('field.start_date')}`, `${T('rep.col.curPlan')} — ${T('field.end_date')}`,
        T('f.actualStart'), T('f.actualEnd'), `${T('rep.col.slip')} (j)`, T('rep.col.moves')],
      ...r.variance.map(({ task: t, slip, moves, origin }) => [
        t.task_no, typeName(ctx.types.get(t.production_type_id), locale), roomName(ctx.rooms.get(t.room_id), locale),
        T(K(`status.${t.status}`)), origin ? T(K(`reason.${origin}`)) : '', t.groweriq_lot_id ?? '', t.groweriq_batch_id ?? '',
        t.original_start_date, t.original_end_date, t.start_date, t.end_date,
        t.actual_start_date ?? '', t.actual_end_date ?? '', String(slip), String(moves),
      ]),
    ];
  }

  const body = '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n');
  const name = `production-${kind}-${from}-au-${to}.csv`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` },
  });
};
