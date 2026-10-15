// Shipping work orders (ps_swos): the paper form F2-QAS-001 production fills
// while preparing an order. Prefilled from the customer PO (read by Claude),
// checked, sent to production as a PDF to print, filled by hand, photographed,
// read back by Claude, checked again, then copied to the people picked.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { SupabaseClient } from '@supabase/supabase-js';
import { localDay, todayLocal } from './production';
import type { ProdRequest } from './production-requests';

export const SWO_STATUSES = ['draft', 'sent', 'completed', 'cancelled'] as const;
export type SwoStatus = (typeof SWO_STATUSES)[number];

/** Who production is, for "send to production" (pre-ticked; the sender can change it). */
export const PRODUCTION_TEAM = ['simon@oaziz.ca', 'theogen53@gmail.com'];
/** Who usually gets the completed copy (pre-ticked; the person can change it). */
export const DEFAULT_COPY_TO = ['stephane@oaziz.ca', 'jacobp@oaziz.ca', 'meissam@oaziz.ca'];

export const SWO_HEADER_FIELDS = ['order_date', 'packaging_date', 'customer_name', 'customer_po', 'prepared_by', 'preparation_date', 'notes'] as const;
export const SWO_LINE_FIELDS = [
  'product_name', 'cultivar', 'product_type', 'lot_no', 'sku_size_g', 'packaging_run_id', 'excise_province',
  'packaging_lot_no', 'po_quantity', 'final_quantity', 'box_no', 'box_size', 'box_weight',
] as const;
export type SwoLineField = (typeof SWO_LINE_FIELDS)[number];
const NUMERIC_LINE_FIELDS: readonly SwoLineField[] = ['sku_size_g', 'po_quantity', 'final_quantity'];
export const isNumericLineField = (f: string) => (NUMERIC_LINE_FIELDS as readonly string[]).includes(f);

export interface SwoLine {
  product_name: string; cultivar: string | null; product_type: string | null; lot_no: string | null;
  sku_size_g: number | null; packaging_run_id: string | null; excise_province: string | null;
  packaging_lot_no: string | null; po_quantity: number | null; final_quantity: number | null;
  box_no: string | null; box_size: string | null; box_weight: string | null;
}
export interface Swo {
  id: string; swo_no: string; request_id: string; status: SwoStatus;
  order_date: string | null; packaging_date: string | null; customer_name: string | null; customer_po: string | null;
  prepared_by: string | null; preparation_date: string | null; notes: string | null;
  po_extraction: any; sheet_extraction: any; sheet_paths: string[];
  version: number; created_at: string; updated_at: string;
  sent_at: string | null; completed_at: string | null; copy_sent_to: string[];
  cancelled_at: string | null; cancel_reason: string | null;
  lines: SwoLine[];
}
export interface SwoEvent { id: number; at: string; staff_name: string | null; kind: string; note: string | null; changes: Record<string, any> }

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const SWO_COLS = '*, lines:ps_swo_lines ( * )';

function shape(row: any): Swo {
  return {
    ...row,
    lines: [...(row.lines ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order).map((l: any) => ({
      product_name: l.product_name, cultivar: l.cultivar, product_type: l.product_type, lot_no: l.lot_no,
      sku_size_g: num(l.sku_size_g), packaging_run_id: l.packaging_run_id, excise_province: l.excise_province,
      packaging_lot_no: l.packaging_lot_no, po_quantity: num(l.po_quantity), final_quantity: num(l.final_quantity),
      box_no: l.box_no, box_size: l.box_size, box_weight: l.box_weight,
    })),
  };
}

export async function loadSwos(admin: SupabaseClient): Promise<Swo[]> {
  const { data, error } = await admin.from('ps_swos').select(SWO_COLS).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(shape);
}
export async function loadSwo(admin: SupabaseClient, id: string): Promise<Swo | null> {
  const { data, error } = await admin.from('ps_swos').select(SWO_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? shape(data) : null;
}
export async function loadSwoForRequest(admin: SupabaseClient, requestId: string): Promise<Swo | null> {
  const { data, error } = await admin.from('ps_swos').select(SWO_COLS).eq('request_id', requestId).maybeSingle();
  if (error) throw error;
  return data ? shape(data) : null;
}
export async function loadSwoEvents(admin: SupabaseClient, id: string): Promise<SwoEvent[]> {
  const { data, error } = await admin.from('ps_swo_events')
    .select('id, at, kind, note, changes, staff:staff ( full_name )')
    .eq('swo_id', id).order('at', { ascending: false }).order('id', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((e: any) => ({ ...e, staff_name: (Array.isArray(e.staff) ? e.staff[0] : e.staff)?.full_name ?? null }));
}

export async function logSwo(admin: SupabaseClient, swoId: string, staffId: string, kind: string, note: string | null, changes: Record<string, unknown> = {}) {
  const { error } = await admin.from('ps_swo_events').insert({ swo_id: swoId, staff_id: staffId, kind, note, changes });
  if (error) console.error('[production] swo event insert failed:', error);
}

// Year-scoped number, BTE-26-0001 (bon de travail d'expédition), compare-and-set.
async function nextSwoSeq(admin: SupabaseClient, year: number): Promise<number> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data: ctr } = await admin.from('ps_swo_counters').select('last').eq('year', year).maybeSingle();
    if (!ctr) {
      const { error } = await admin.from('ps_swo_counters').insert({ year, last: 1 });
      if (!error) return 1;
      continue;
    }
    const { data: upd } = await admin.from('ps_swo_counters')
      .update({ last: ctr.last + 1 }).eq('year', year).eq('last', ctr.last).select('last');
    if (upd && upd.length) return ctr.last + 1;
  }
  throw new Error('swo counter busy');
}

/** A blank line. */
export const emptyLine = (product_name = ''): SwoLine => ({
  product_name, cultivar: null, product_type: null, lot_no: null, sku_size_g: null, packaging_run_id: null,
  excise_province: null, packaging_lot_no: null, po_quantity: null, final_quantity: null, box_no: null, box_size: null, box_weight: null,
});

/**
 * Creates the work order of a request: from what Claude read on the PO when
 * there is a reading, otherwise from the request's own lines.
 */
export async function createSwo(admin: SupabaseClient, staffId: string, r: ProdRequest, po: PoExtraction | null): Promise<string> {
  const year = Number(todayLocal().slice(0, 4));
  const seq = await nextSwoSeq(admin, year);
  const swo_no = `BTE-${String(year % 100).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;
  const lines: SwoLine[] = po && po.lines.length
    ? po.lines.map((l) => ({
      ...emptyLine(l.product_name), cultivar: l.cultivar, product_type: l.product_type,
      sku_size_g: l.sku_size_g, po_quantity: l.quantity,
    }))
    : r.lines.map((l) => ({ ...emptyLine(l.description), po_quantity: l.quantity }));
  const { data, error } = await admin.from('ps_swos').insert({
    swo_no, request_id: r.id,
    order_date: po?.order_date ?? localDay(r.created_at),
    customer_name: po?.customer_name ?? r.customer_name,
    customer_po: po?.customer_po ?? r.customer_po,
    notes: r.notes,
    po_extraction: po,
    created_by: staffId, updated_by: staffId,
  }).select('id').single();
  if (error || !data) throw error ?? new Error('insert failed');
  if (lines.length) {
    const { error: lErr } = await admin.from('ps_swo_lines').insert(lines.map((l, i) => ({ ...l, swo_id: data.id, sort_order: i + 1 })));
    if (lErr) throw lErr;
  }
  await logSwo(admin, data.id, staffId, 'created', null, { from_po: !!po, lines: lines.length });
  return data.id;
}

export type SwoHeader = Pick<Swo, (typeof SWO_HEADER_FIELDS)[number]>;

/** Saves header + lines, logging what changed; false when nothing did. */
export async function saveSwo(
  admin: SupabaseClient, staffId: string, cur: Swo, header: SwoHeader, lines: SwoLine[],
  extra: Record<string, unknown> = {}, kind: 'updated' | 'sheet_uploaded' = 'updated',
): Promise<boolean> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of SWO_HEADER_FIELDS) if ((cur[f] ?? null) !== (header[f] ?? null)) changes[f] = { from: cur[f] ?? null, to: header[f] ?? null };
  const linesChanged = JSON.stringify(cur.lines) !== JSON.stringify(lines);
  if (linesChanged) changes.lines = { from: cur.lines, to: lines };
  if (!Object.keys(changes).length && !Object.keys(extra).length) return false;
  const { data: upd, error } = await admin.from('ps_swos').update({
    ...header, ...extra, version: cur.version + 1, updated_by: staffId, updated_at: new Date().toISOString(),
  }).eq('id', cur.id).eq('version', cur.version).select('id');
  if (error) throw error;
  if (!upd?.length) throw new Error('VERSION_CONFLICT');
  if (linesChanged) {
    await admin.from('ps_swo_lines').delete().eq('swo_id', cur.id);
    if (lines.length) {
      const { error: lErr } = await admin.from('ps_swo_lines').insert(lines.map((l, i) => ({ ...l, swo_id: cur.id, sort_order: i + 1 })));
      if (lErr) throw lErr;
    }
  }
  if (Object.keys(changes).length || kind === 'sheet_uploaded') await logSwo(admin, cur.id, staffId, kind, null, changes);
  return true;
}

/** Active staff to pick recipients from. */
export async function staffDirectory(admin: SupabaseClient): Promise<Array<{ email: string; full_name: string }>> {
  const { data } = await admin.from('staff').select('email, full_name').eq('is_active', true).order('full_name');
  return (data ?? []).filter((s: any) => !!s.email);
}

// ------------------------------------------------------------- reading (Claude)

export const PoExtraction = z.object({
  customer_name: z.string().nullable().describe('The BUYER (customer) company name'),
  customer_po: z.string().nullable().describe('The customer purchase order number, as printed'),
  order_date: z.string().nullable().describe('PO date, YYYY-MM-DD'),
  requested_delivery_date: z.string().nullable().describe('Requested delivery / ship date, YYYY-MM-DD'),
  ship_to: z.string().nullable().describe('Delivery address, one line'),
  lines: z.array(z.object({
    product_name: z.string().describe('Product as named on the PO'),
    cultivar: z.string().nullable().describe('Strain / cultivar if stated'),
    product_type: z.string().nullable().describe('e.g. Rosin, Hash, Kief, Bubble hash, Vape, Pre-roll, Flower'),
    sku_size_g: z.number().nullable().describe('Unit size in grams, e.g. 1 for a 1 g jar'),
    quantity: z.number().nullable().describe('Number of units ordered'),
  })),
  notes: z.string().nullable().describe('Any special instruction on the PO, one or two lines'),
});
export type PoExtraction = z.infer<typeof PoExtraction>;

const PO_PROMPT = `You are reading a purchase order received by Oaziz Extracts Inc. (a cannabis processor in Montréal) from one of its customers.
Oaziz is the SUPPLIER on this document — the customer is the company buying. Never return Oaziz as the customer.
Extract the order so production can prepare it. One line per product ordered. Dates as YYYY-MM-DD (Québec documents often print DD/MM/YYYY; use month names and context to decide). Quantities as plain numbers.
If a field is not on the document, return null rather than guessing.`;

export const SheetExtraction = z.object({
  packaging_date: z.string().nullable().describe('"Packaging Date" field, YYYY-MM-DD'),
  prepared_by: z.string().nullable().describe('"Prepared By" field'),
  preparation_date: z.string().nullable().describe('"Order Preparation Date" field, YYYY-MM-DD'),
  lines: z.array(z.object({
    row: z.number().describe('1-based row number in the table, matching the printed rows listed in the instructions'),
    product_name: z.string().nullable(),
    lot_no: z.string().nullable(),
    packaging_run_id: z.string().nullable(),
    excise_province: z.string().nullable(),
    packaging_lot_no: z.string().nullable(),
    final_quantity: z.number().nullable(),
    box_no: z.string().nullable(),
    box_size: z.string().nullable(),
    box_weight: z.string().nullable(),
  })),
  unreadable: z.array(z.string()).describe('Fields or cells that are filled in but could not be read with confidence, e.g. "row 2 LOT #"'),
});
export type SheetExtraction = z.infer<typeof SheetExtraction>;

export function readingAvailable(): boolean {
  return !!import.meta.env.ANTHROPIC_API_KEY;
}

type Doc = { data: Buffer; mediaType: string };
function docBlock(f: Doc) {
  const b64 = f.data.toString('base64');
  return f.mediaType === 'application/pdf'
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: b64 } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: f.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: b64 } };
}
async function read<T>(files: Doc[], prompt: string, schema: z.ZodType<T>): Promise<T> {
  const client = new Anthropic({ apiKey: import.meta.env.ANTHROPIC_API_KEY });
  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(schema as any) },
    messages: [{ role: 'user', content: [...files.map(docBlock), { type: 'text', text: prompt }] }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Le document n’a pas pu être lu (refus du modèle).');
  if (!response.parsed_output) throw new Error('Lecture incomplète du document.');
  return response.parsed_output as T;
}

export const READABLE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export function readPurchaseOrder(file: Doc): Promise<PoExtraction> {
  return read([file], PO_PROMPT, PoExtraction);
}

/** Reads the hand-filled sheet; the printed rows are listed so cells map to the right line. */
export function readCompletedSheet(files: Doc[], swo: Swo): Promise<SheetExtraction> {
  const rows = swo.lines.map((l, i) => `${i + 1}. ${l.product_name}${l.cultivar ? ` (${l.cultivar})` : ''} — PO quantity ${l.po_quantity ?? '?'}`).join('\n');
  const prompt = `These photos show a "SHIPPING WORK ORDER" form (F2-QAS-001) of Oaziz Extracts, printed by the portal and then filled in BY HAND by the production team while preparing customer order ${swo.customer_po ?? ''} for ${swo.customer_name ?? ''} (work order ${swo.swo_no}).
The printed rows of the table are, in order:
${rows}
Rows below these may have been added by hand: number them after the printed ones.
Read the HANDWRITTEN values: Packaging Date, Prepared By, Order Preparation Date, and for each row the LOT #, PACKAGING RUN ID, EXCISE STAMP PROVINCE, Packaging LOT #, FINAL Quantity Prepared, BOX #, BOX SIZE (L x W x H) and BOX WEIGHT.
Ignore what was already printed unless it was crossed out and corrected by hand (then return the correction). Dates as YYYY-MM-DD (the team writes DD/MM/YYYY or YYYY-MM-DD). Leave a cell null when it is empty. List in "unreadable" any filled cell you cannot read with confidence instead of guessing.`;
  return read(files, prompt, SheetExtraction);
}

/** Puts what was read on the sheet into the work order (only cells that were filled). */
export function mergeSheet(swo: Swo, s: SheetExtraction): { header: SwoHeader; lines: SwoLine[] } {
  const header: SwoHeader = {
    order_date: swo.order_date, customer_name: swo.customer_name, customer_po: swo.customer_po, notes: swo.notes,
    packaging_date: s.packaging_date ?? swo.packaging_date,
    prepared_by: s.prepared_by ?? swo.prepared_by,
    preparation_date: s.preparation_date ?? swo.preparation_date,
  };
  const lines = swo.lines.map((l) => ({ ...l }));
  for (const r of s.lines) {
    const idx = r.row - 1;
    if (idx < 0) continue;
    if (idx >= lines.length) {
      if (!r.product_name) continue;
      lines.push(emptyLine(r.product_name));
    }
    const l = lines[idx];
    for (const f of ['lot_no', 'packaging_run_id', 'excise_province', 'packaging_lot_no', 'box_no', 'box_size', 'box_weight'] as const) {
      if (r[f]) (l as any)[f] = r[f];
    }
    if (r.final_quantity !== null) l.final_quantity = r.final_quantity;
  }
  return { header, lines };
}

// ------------------------------------------------------------------------ PDF

// Standard PDF fonts only know Latin-1: map the usual typographic characters
// and drop anything else, so a stray emoji never breaks the PDF.
function pdfText(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/ | /g, ' ').replace(/[^\x20-\x7e -ÿ]/g, '');
}
const fmtNum = (n: number | null) => (n === null ? '' : Number.isInteger(n) ? String(n) : String(n).replace('.', ','));

function fitText(t: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  let s = t;
  while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, size) > width) s = s.slice(0, -1);
  return `${s}...`;
}

/** The F2-QAS-001 sheet: printed values plus empty cells for production to fill by hand. */
export async function buildSwoPdf(swo: Swo, opts: { requestNo?: string } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Shipping Work Order ${swo.swo_no}`);
  const page: PDFPage = doc.addPage([792, 612]); // letter, landscape
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.11, 0.14);
  const grey = rgb(0.45, 0.47, 0.5);
  const line = rgb(0.6, 0.62, 0.66);
  const accent = rgb(0.816, 0.345, 0.149);
  const M = 28; const W = 792 - 2 * M;

  const text = (t: string, x: number, y: number, size = 9, font = reg, color = ink) =>
    page.drawText(pdfText(t), { x, y, size, font, color });

  // Title and form references
  text('F2-QAS-001', M, 580, 8, reg, grey);
  const ref = 'F2-QAS-015/01';
  text(ref, 792 - M - reg.widthOfTextAtSize(ref, 8), 580, 8, reg, grey);
  const title = 'SHIPPING WORK ORDER';
  text(title, (792 - bold.widthOfTextAtSize(title, 16)) / 2, 572, 16, bold);
  const sub = `Oaziz Extracts  -  ${swo.swo_no}${opts.requestNo ? `  -  ${opts.requestNo}` : ''}`;
  text(sub, (792 - reg.widthOfTextAtSize(sub, 8)) / 2, 560, 8, reg, grey);
  page.drawLine({ start: { x: M, y: 552 }, end: { x: 792 - M, y: 552 }, thickness: 1.5, color: accent });

  // Header fields, two columns; empty ones get a line to write on.
  const field = (label: string, value: string | null, x: number, y: number, w: number) => {
    text(label, x, y, 9, bold);
    const lx = x + bold.widthOfTextAtSize(label, 9) + 6;
    page.drawLine({ start: { x: lx, y: y - 3 }, end: { x: x + w, y: y - 3 }, thickness: 0.6, color: line });
    if (value) text(fitText(pdfText(value), reg, 10, x + w - lx - 4), lx + 2, y, 10);
  };
  const half = W / 2 - 14;
  field('Order Date:', swo.order_date, M, 528, half);
  field('Packaging Date:', swo.packaging_date, M + W / 2 + 14, 528, half);
  field('Customer Name:', swo.customer_name, M, 506, half);
  field('Customer PO #:', swo.customer_po, M + W / 2 + 14, 506, half);
  field('Prepared By:', swo.prepared_by, M, 484, half);
  field('Order Preparation Date:', swo.preparation_date, M + W / 2 + 14, 484, half);

  // Table
  const cols: Array<{ h: string; w: number; v: (l: SwoLine) => string }> = [
    { h: 'PRODUCT NAME', w: 92, v: (l) => l.product_name },
    { h: 'Cultivar if Rotational (to add on label)', w: 70, v: (l) => l.cultivar ?? '' },
    { h: 'PRODUCT TYPE', w: 54, v: (l) => l.product_type ?? '' },
    { h: 'LOT #', w: 56, v: (l) => l.lot_no ?? '' },
    { h: 'SKU SIZE (g)', w: 38, v: (l) => fmtNum(l.sku_size_g) },
    { h: 'PACKAGING RUN ID', w: 56, v: (l) => l.packaging_run_id ?? '' },
    { h: 'EXCISE STAMP PROVINCE', w: 46, v: (l) => l.excise_province ?? '' },
    { h: 'Packaging LOT #', w: 56, v: (l) => l.packaging_lot_no ?? '' },
    { h: 'PO Quantity', w: 40, v: (l) => fmtNum(l.po_quantity) },
    { h: 'FINAL Quantity Prepared', w: 50, v: (l) => fmtNum(l.final_quantity) },
    { h: 'BOX #', w: 32, v: (l) => l.box_no ?? '' },
    { h: 'BOX SIZE L x W x H', w: 64, v: (l) => l.box_size ?? '' },
    { h: 'BOX WEIGHT', w: 0, v: (l) => l.box_weight ?? '' },
  ];
  const used = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w = W - used;

  const top = 462; const headH = 34; const rowH = 26;
  const rows = Math.max(swo.lines.length + 3, 8);
  const tableBottom = top - headH - rows * rowH;
  page.drawRectangle({ x: M, y: top - headH, width: W, height: headH, color: rgb(0.97, 0.94, 0.92) });
  let x = M;
  for (const c of cols) {
    // Header labels wrap on two or three lines.
    const words = pdfText(c.h).split(' ');
    const linesH: string[] = []; let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (bold.widthOfTextAtSize(t, 6.5) > c.w - 4 && cur) { linesH.push(cur); cur = w; } else cur = t;
    }
    if (cur) linesH.push(cur);
    linesH.slice(0, 3).forEach((t, i) => text(t, x + 2, top - 10 - i * 8, 6.5, bold));
    page.drawLine({ start: { x, y: top }, end: { x, y: tableBottom }, thickness: 0.6, color: line });
    x += c.w;
  }
  page.drawLine({ start: { x: M + W, y: top }, end: { x: M + W, y: tableBottom }, thickness: 0.6, color: line });
  for (let r = 0; r <= rows + 1; r++) {
    const y = r === 0 ? top : top - headH - (r - 1) * rowH;
    if (y < tableBottom) break;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: r <= 1 ? 0.9 : 0.5, color: line });
  }
  swo.lines.forEach((l, i) => {
    let cx = M;
    const y = top - headH - i * rowH - 16;
    for (const c of cols) {
      const v = c.v(l);
      if (v) text(fitText(pdfText(v), reg, 8, c.w - 4), cx + 2, y, 8);
      cx += c.w;
    }
  });

  if (swo.notes) text(fitText(`Notes: ${pdfText(swo.notes)}`, reg, 8, W), M, tableBottom - 16, 8, reg, grey);
  const foot = `Imprimé le ${todayLocal()} - à remplir à la main pendant la préparation, puis photographier la feuille dans le portail (Production > Expéditions > ${swo.swo_no}).`;
  text(fitText(foot, reg, 7, W), M, 22, 7, reg, grey);
  return doc.save();
}
