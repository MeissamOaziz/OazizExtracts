// Packing list (Word) of a completed shipping work order, on Oaziz's packing
// slip layout (the one used for the OCS orders). Filled with what the work
// order knows — ship-to, PO, lots, quantities, box numbers — and the carrier
// once the shipment is booked; the rest (item #, cases, contact, notes) stays
// blank to complete by hand.

import JSZip from 'jszip';
import { PACKING_LIST_TEMPLATE_B64 } from './templates/packing-list-template';
import type { Swo } from './production-swo';
import { isOcs, type Shipment } from './shipments';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Text for a placeholder; line breaks become Word line breaks. */
const wtext = (s: string | number | null | undefined) =>
  esc(s === null || s === undefined ? '' : String(s)).replace(/\r?\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
const fmtNum = (n: number | null) => (n === null ? '' : Number.isInteger(n) ? String(n) : String(n));

export function packingListFilename(swo: Swo): string {
  const po = (swo.customer_po ?? swo.swo_no).replace(/[^\w.-]+/g, '_');
  return `OAZIZ - Packing-List - ${po}.docx`;
}

export async function buildPackingList(swo: Swo, shipment: Shipment | null): Promise<Buffer<ArrayBuffer>> {
  const zip = await JSZip.loadAsync(Buffer.from(PACKING_LIST_TEMPLATE_B64, 'base64'));
  let x = await zip.file('word/document.xml')!.async('string');
  const ocs = isOcs(swo.customer_name);

  // One table row per work order line, cloned from the template row.
  const rowStart = x.indexOf('<!--ROW-->');
  const rowEnd = x.indexOf('<!--/ROW-->');
  const rowTpl = x.slice(rowStart + '<!--ROW-->'.length, rowEnd);
  const lines = swo.lines.filter((l) => l.product_name);
  const rows = lines.map((l) => rowTpl
    .replace('{{PALLET}}', () => shipment?.mode === 'pallet' ? '1' : '')
    .replace('{{CASE}}', () => wtext(l.box_no))
    .replace('{{ITEM}}', () => '')
    .replace('{{LOT}}', () => wtext(l.lot_no))
    .replace('{{DESC}}', () => wtext(l.cultivar && !l.product_name.includes(l.cultivar) ? `${l.product_name} (${l.cultivar})` : l.product_name))
    .replace('{{UNITS}}', () => wtext(fmtNum(l.final_quantity ?? l.po_quantity)))
    .replace('{{CASES}}', () => '')).join('');
  x = x.slice(0, rowStart) + rows + x.slice(rowEnd + '<!--/ROW-->'.length);

  const units = lines.reduce((s, l) => s + (l.final_quantity ?? l.po_quantity ?? 0), 0);
  const boxCount = shipment?.boxes.length ?? new Set(lines.map((l) => l.box_no).filter(Boolean)).size;
  const shipTo = [swo.customer_name, shipment?.ship_to ?? swo.po_extraction?.ship_to].filter(Boolean).join('\n');
  const date = new Date().toLocaleDateString('en-US', { timeZone: 'America/Toronto', year: 'numeric', month: 'long', day: 'numeric' });
  const fill: Record<string, string> = {
    DATE: wtext(date),
    SHIP_TO: wtext(shipTo),
    VENDOR_ID: ocs ? ' (Vendor ID 101364)' : '',
    CUST: ocs ? 'OCS ' : '',
    PO: wtext(swo.customer_po),
    VIA: wtext(shipment?.carrier),
    CONTACT: '',
    TOTAL_UNITS: wtext(fmtNum(units || null)),
    TOTAL_CASES: boxCount ? String(boxCount) : '',
    // The work order's notes are internal (often the PO reader's remarks): left for a hand-written note.
    NOTES: '',
  };
  x = x.replace(/\{\{([A-Z_]+)\}\}/g, (m, k: string) => (k in fill ? fill[k] : m));
  zip.file('word/document.xml', x);
  return Buffer.from(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}
