// Turns the OCS packing list of PO-0113975 (QA drive, Customers/OCS) into the
// packing list template the portal fills: sample values become {{PLACEHOLDERS}}
// and the embedded fonts (2.7 MB) are dropped.
// usage: node scripts/make-packing-list-template.mjs <source.docx> <out.docx> src/lib/templates/packing-list-template.ts
import fs from 'node:fs';
import JSZip from 'jszip';
import { cellWith, editor, must, stripFonts } from './lib/docx-template.mjs';

const [, , inPath, outPath, tsPath] = process.argv;
const zip = await JSZip.loadAsync(fs.readFileSync(inPath));
const d = editor(await zip.file('word/document.xml').async('string'));

// Header block
d.setPara('October ', '{{DATE}}');
d.setCell('Quaterman', '{{SHIP_TO}}');
d.x = d.x.replace('>Oaziz Extracts Inc. (Vendor ID 101364)<', '>Oaziz Extracts Inc.{{VENDOR_ID}}<');
for (const h of ['Purchase Order', 'Contact', 'Item #', 'Item Description']) {
  must(d.x.indexOf(`>OCS ${h}<`), h);
  d.x = d.x.replace(`>OCS ${h}<`, `>{{CUST}}${h}<`);
}
d.setPara('PO-0113', '{{PO}}');
d.setPara('Les Messagers', '{{VIA}}');
d.setPara('Khloe Dias', '{{CONTACT}}');

// Lines: the first item row becomes the row template, the other nine go.
for (const n of ['107511_', '302516_', '302542_', '302543_', '312519_', '312582_', '312583_', '312584_', '312585_']) d.removeRow(n);
d.rowTemplate('107510_28g_', ['{{PALLET}}', '{{CASE}}', '{{ITEM}}', '{{LOT}}', '{{DESC}}', '{{UNITS}}', '{{CASES}}']);
d.inRow('Grand Total', [['222', '{{TOTAL_UNITS}}'], ['37', '{{TOTAL_CASES}}']]);
{
  // Notes: the table's second row, first cell.
  const i = must(d.x.indexOf('Special Notes'), 'notes');
  const t0 = d.x.lastIndexOf('<w:tbl>', i); const t1 = d.x.indexOf('</w:tbl>', i);
  const tbl = d.x.slice(t0, t1);
  const r2 = [...tbl.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)][1][0];
  const c = r2.match(/<w:tc>[\s\S]*?<\/w:tc>|<w:tc [^>]*>[\s\S]*?<\/w:tc>/)[0];
  d.x = d.x.slice(0, t0) + tbl.replace(r2, r2.replace(c, cellWith(c, '{{NOTES}}'))) + d.x.slice(t1);
}
d.expect(['{{DATE}}', '{{SHIP_TO}}', '{{VENDOR_ID}}', '{{CUST}}', '{{PO}}', '{{VIA}}', '{{CONTACT}}', '{{DESC}}', '{{TOTAL_UNITS}}', '{{NOTES}}'],
  /Quaterman|Khloe|107510|Messagers|101364/);
zip.file('word/document.xml', d.x);
await stripFonts(zip);

const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(outPath, buf);
fs.writeFileSync(tsPath, `// Packing list template (Word), from the OCS packing list of PO-0113975 with
// the sample values replaced by {{PLACEHOLDERS}} and the embedded fonts removed.
// Regenerate with scripts/make-packing-list-template.mjs; filled by
// src/lib/packing-list.ts.
export const PACKING_LIST_TEMPLATE_B64 = '${buf.toString('base64')}';
`);
console.log('template', buf.length, 'bytes');
