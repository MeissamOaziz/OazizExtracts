// Turns the OCS packing list of PO-0113975 (QA drive, Customers/OCS) into the
// packing list template the portal fills: sample values become {{PLACEHOLDERS}}
// and the embedded fonts (2.7 MB) are dropped.
// usage: node scripts/make-packing-list-template.mjs <source.docx> <out.docx> src/lib/templates/packing-list-template.ts
import fs from 'node:fs';
import JSZip from 'jszip';

const [, , inPath, outPath, tsPath] = process.argv;
const zip = await JSZip.loadAsync(fs.readFileSync(inPath));
let x = await zip.file('word/document.xml').async('string');

const must = (i, what) => { if (i < 0) throw new Error(`not found: ${what}`); return i; };
const pStart = (s, i) => Math.max(s.lastIndexOf('<w:p>', i), s.lastIndexOf('<w:p ', i));
const tagStart = (s, i, tag) => Math.max(s.lastIndexOf(`<${tag}>`, i), s.lastIndexOf(`<${tag} `, i));

/** End of the paragraph starting at `i`; empty paragraphs are self-closing (<w:p .../>). */
function paraEnd(s, i) {
  const gt = s.indexOf('>', i);
  return s[gt - 1] === '/' ? gt + 1 : s.indexOf('</w:p>', i) + 6;
}
/** Rebuilds one paragraph as a single run holding `text`, keeping its paragraph and first-run formatting. */
function rebuildPara(p, text) {
  const open = p.match(/^<w:p(?: [^>]*?)?\/?>/)[0].replace(/\/>$/, '>');
  const pPr = (p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) ?? [''])[0];
  const firstRun = p.match(/<w:r>[\s\S]*?<\/w:r>|<w:r [^>]*>[\s\S]*?<\/w:r>/);
  const rPr = firstRun ? (firstRun[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/) ?? [''])[0] : '';
  return `${open}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}
function setPara(needle, text) {
  const i = must(x.indexOf(needle), needle);
  const a = pStart(x, i); const b = paraEnd(x, a);
  x = x.slice(0, a) + rebuildPara(x.slice(a, b), text) + x.slice(b);
}
/** Cell keeps its properties and first paragraph only, holding `text`. */
function cellWith(cell, text) {
  const open = cell.match(/^<w:tc(?: [^>]*)?>/)[0];
  const tcPr = (cell.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) ?? [''])[0];
  const pi = must(cell.search(/<w:p[ >]/), 'para in cell');
  const pe = paraEnd(cell, pi);
  return `${open}${tcPr}${rebuildPara(cell.slice(pi, pe), text)}</w:tc>`;
}
function setCell(needle, text) {
  const i = must(x.indexOf(needle), needle);
  const a = tagStart(x, i, 'w:tc'); const b = x.indexOf('</w:tc>', i) + 7;
  x = x.slice(0, a) + cellWith(x.slice(a, b), text) + x.slice(b);
}
function rowBounds(needle) {
  const i = must(x.indexOf(needle), needle);
  return [tagStart(x, i, 'w:tr'), x.indexOf('</w:tr>', i) + 7];
}

// Header block
setPara('October ', '{{DATE}}');
setCell('Quaterman', '{{SHIP_TO}}');
x = x.replace('>Oaziz Extracts Inc. (Vendor ID 101364)<', '>Oaziz Extracts Inc.{{VENDOR_ID}}<');
for (const h of ['Purchase Order', 'Contact', 'Item #', 'Item Description']) {
  must(x.indexOf(`>OCS ${h}<`), h);
  x = x.replace(`>OCS ${h}<`, `>{{CUST}}${h}<`);
}
setPara('PO-0113', '{{PO}}');
setPara('Les Messagers', '{{VIA}}');
setPara('Khloe Dias', '{{CONTACT}}');

// Lines: the first item row becomes the row template, the other nine go.
for (const n of ['107511_', '302516_', '302542_', '302543_', '312519_', '312582_', '312583_', '312584_', '312585_']) {
  const [a, b] = rowBounds(n);
  x = x.slice(0, a) + x.slice(b);
}
{
  const [a, b] = rowBounds('107510_28g_');
  const row = x.slice(a, b);
  const cells = row.match(/<w:tc>[\s\S]*?<\/w:tc>|<w:tc [^>]*>[\s\S]*?<\/w:tc>/g);
  const ph = ['{{PALLET}}', '{{CASE}}', '{{ITEM}}', '{{LOT}}', '{{DESC}}', '{{UNITS}}', '{{CASES}}'];
  if (cells.length !== ph.length) throw new Error(`item row has ${cells.length} cells`);
  let out = row;
  cells.forEach((c, k) => { out = out.replace(c, cellWith(c, ph[k])); });
  x = x.slice(0, a) + `<!--ROW-->${out}<!--/ROW-->` + x.slice(b);
}
{
  const [a, b] = rowBounds('Grand Total');
  const row = x.slice(a, b)
    .replace(/<w:t>222<\/w:t>/, '<w:t>{{TOTAL_UNITS}}</w:t>')
    .replace(/<w:t>37<\/w:t>/, '<w:t>{{TOTAL_CASES}}</w:t>');
  if (!row.includes('{{TOTAL_UNITS}}') || !row.includes('{{TOTAL_CASES}}')) throw new Error('totals not found');
  x = x.slice(0, a) + row + x.slice(b);
}
{
  // Notes: the table's second row, first cell.
  const i = must(x.indexOf('Special Notes'), 'notes');
  const t0 = x.lastIndexOf('<w:tbl>', i); const t1 = x.indexOf('</w:tbl>', i);
  const tbl = x.slice(t0, t1);
  const rows = [...tbl.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)];
  const r2 = rows[1][0];
  const c = r2.match(/<w:tc>[\s\S]*?<\/w:tc>|<w:tc [^>]*>[\s\S]*?<\/w:tc>/)[0];
  x = x.slice(0, t0) + tbl.replace(r2, r2.replace(c, cellWith(c, '{{NOTES}}'))) + x.slice(t1);
}
for (const p of ['{{DATE}}', '{{SHIP_TO}}', '{{VENDOR_ID}}', '{{CUST}}', '{{PO}}', '{{VIA}}', '{{CONTACT}}', '{{DESC}}', '{{TOTAL_UNITS}}', '{{NOTES}}']) {
  if (!x.includes(p)) throw new Error(`missing ${p}`);
}
if (/Quaterman|Khloe|107510|Messagers|101364/.test(x)) throw new Error('sample data left in the template');
zip.file('word/document.xml', x);

// Drop the embedded fonts (2.7 MB): Word substitutes the same families.
for (const f of Object.keys(zip.files)) if (f.startsWith('word/fonts/')) zip.remove(f);
zip.remove('word/_rels/fontTable.xml.rels');
zip.file('word/fontTable.xml', (await zip.file('word/fontTable.xml').async('string')).replace(/<w:embed(Regular|Bold|Italic|BoldItalic)\b[^>]*\/>/g, ''));
zip.file('word/settings.xml', (await zip.file('word/settings.xml').async('string')).replace(/<w:embedTrueTypeFonts\b[^>]*\/>|<w:saveSubsetFonts\b[^>]*\/>/g, ''));
zip.file('[Content_Types].xml', (await zip.file('[Content_Types].xml').async('string')).replace(/<Default Extension="odttf"[^>]*\/>/g, ''));

const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(outPath, buf);
fs.writeFileSync(tsPath, `// Packing list template (Word), from the OCS packing list of PO-0113975 with
// the sample values replaced by {{PLACEHOLDERS}} and the embedded fonts removed.
// Regenerate with scripts/make-packing-list-template.mjs; filled by
// src/lib/packing-list.ts.
export const PACKING_LIST_TEMPLATE_B64 = '${buf.toString('base64')}';
`);
console.log('template', buf.length, 'bytes');
