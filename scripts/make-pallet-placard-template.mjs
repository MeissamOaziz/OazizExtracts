// Turns the OCS pallet placard of PO-0113603 (QA drive, Customers/OCS,
// "Pallet Placard Flow Through (Colored)") into the template the portal fills:
// sample values become {{PLACEHOLDERS}} and the embedded fonts are dropped.
// usage: node scripts/make-pallet-placard-template.mjs <source.docx> <out.docx> src/lib/templates/pallet-placard-template.ts
import fs from 'node:fs';
import JSZip from 'jszip';
import { editor, stripFonts } from './lib/docx-template.mjs';

const [, , inPath, outPath, tsPath] = process.argv;
const zip = await JSZip.loadAsync(fs.readFileSync(inPath));
const d = editor(await zip.file('word/document.xml').async('string'));

d.setPara('PO-0113', '{{PO}}');
for (const n of ['107618_', '302516_', '302542_', '302543_', '312519_', '312582_', '312583_', '312585_']) d.removeRow(n);
d.rowTemplate('107510_28g_', ['{{ITEM}}', '{{DESC}}', '{{UNITS}}', '{{CASES}}', '{{LOT}}']);
d.inRow('Grand Total', [['222', '{{TOTAL_UNITS}}'], ['37', '{{TOTAL_CASES}}']]);
d.setPara('PALLET 1 of 1', '{{PALLET_LABEL}}');
d.expect(['{{PO}}', '{{ITEM}}', '{{TOTAL_UNITS}}', '{{PALLET_LABEL}}'], /107510|0113603|75160/);
zip.file('word/document.xml', d.x);
await stripFonts(zip);

const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(outPath, buf);
fs.writeFileSync(tsPath, `// OCS pallet placard template (Word, "Flow Through (Colored)"), from the
// placard of PO-0113603 with the sample values replaced by {{PLACEHOLDERS}}
// and the embedded fonts removed. Regenerate with
// scripts/make-pallet-placard-template.mjs; filled by src/lib/ocs-documents.ts.
export const PALLET_PLACARD_TEMPLATE_B64 = '${buf.toString('base64')}';
`);
console.log('template', buf.length, 'bytes');
