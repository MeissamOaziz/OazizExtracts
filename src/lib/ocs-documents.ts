// OCS-only shipping documents. The Ontario Cannabis Store requires, before an
// order ships, a pallet placard on each pallet ("Flow Through (Colored)"
// layout) listing the OCS item #, description, shipped units and cases and the
// lot of every line. Filled from the shipping work order; one page per pallet.
// (The OCS packing slip is the regular packing list: src/lib/packing-list.ts.)

import JSZip from 'jszip';
import { PALLET_PLACARD_TEMPLATE_B64 } from './templates/pallet-placard-template';
import type { Swo } from './production-swo';
import type { Shipment } from './shipments';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const wtext = (v: string | number | null | undefined) => esc(v === null || v === undefined ? '' : String(v));

export function palletPlacardFilename(swo: Swo): string {
  return `Pallet Placard Flow Through (Colored) - ${(swo.customer_po ?? swo.swo_no).replace(/[^\w.-]+/g, '_')}.docx`;
}

export async function buildPalletPlacard(swo: Swo, shipment: Shipment | null): Promise<Buffer<ArrayBuffer>> {
  const zip = await JSZip.loadAsync(Buffer.from(PALLET_PLACARD_TEMPLATE_B64, 'base64'));
  let x = await zip.file('word/document.xml')!.async('string');

  const lines = swo.lines.filter((l) => l.product_name);
  const a = x.indexOf('<!--ROW-->'); const b = x.indexOf('<!--/ROW-->');
  const rowTpl = x.slice(a + '<!--ROW-->'.length, b);
  const rows = lines.map((l) => rowTpl
    .replace('{{ITEM}}', () => wtext(l.item_no))
    .replace('{{DESC}}', () => wtext(l.product_name))
    .replace('{{UNITS}}', () => wtext(l.final_quantity ?? l.po_quantity))
    .replace('{{CASES}}', () => wtext(l.cases))
    .replace('{{LOT}}', () => wtext(l.lot_no))).join('');
  x = x.slice(0, a) + rows + x.slice(b + '<!--/ROW-->'.length);

  const units = lines.reduce((s, l) => s + (l.final_quantity ?? l.po_quantity ?? 0), 0);
  const cases = lines.reduce((s, l) => s + (l.cases ?? 0), 0);
  x = x.replace('{{PO}}', () => wtext(swo.customer_po))
    .replace('{{TOTAL_UNITS}}', () => (units ? String(units) : ''))
    .replace('{{TOTAL_CASES}}', () => (cases ? String(cases) : ''));

  // One placard page per pallet ("PALLET 1 of 2", "PALLET 2 of 2").
  const pallets = Math.max(1, shipment?.mode === 'pallet' ? shipment.pallets ?? 1 : 1);
  const bodyStart = x.indexOf('<w:body>') + '<w:body>'.length;
  const sect = x.lastIndexOf('<w:sectPr');
  const body = x.slice(bodyStart, sect);
  const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const pages = Array.from({ length: pallets }, (_, i) => body.replace('{{PALLET_LABEL}}', `PALLET ${i + 1} of ${pallets}`));
  x = x.slice(0, bodyStart) + pages.join(pageBreak) + x.slice(sect);

  zip.file('word/document.xml', x);
  return Buffer.from(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}
