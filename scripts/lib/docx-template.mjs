// Helpers to turn a filled-in Word document into a portal template: sample
// values are replaced by {{PLACEHOLDERS}} by editing word/document.xml as text
// (no XML library: Word's namespaces and mc:Ignorable must survive untouched).

export const must = (i, what) => { if (i < 0) throw new Error(`not found: ${what}`); return i; };
const tagStart = (s, i, tag) => Math.max(s.lastIndexOf(`<${tag}>`, i), s.lastIndexOf(`<${tag} `, i));
const CELL = /<w:tc>[\s\S]*?<\/w:tc>|<w:tc [^>]*>[\s\S]*?<\/w:tc>/g;

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
/** A cell keeps its properties and first paragraph only, holding `text`. */
export function cellWith(cell, text) {
  const open = cell.match(/^<w:tc(?: [^>]*)?>/)[0];
  const tcPr = (cell.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) ?? [''])[0];
  const pi = must(cell.search(/<w:p[ >]/), 'para in cell');
  return `${open}${tcPr}${rebuildPara(cell.slice(pi, paraEnd(cell, pi)), text)}</w:tc>`;
}

/** Editing session over one document.xml string. */
export function editor(xml) {
  const d = {
    x: xml,
    setPara(needle, text) {
      const i = must(d.x.indexOf(needle), needle);
      const a = Math.max(d.x.lastIndexOf('<w:p>', i), d.x.lastIndexOf('<w:p ', i));
      const b = paraEnd(d.x, a);
      d.x = d.x.slice(0, a) + rebuildPara(d.x.slice(a, b), text) + d.x.slice(b);
    },
    setCell(needle, text) {
      const i = must(d.x.indexOf(needle), needle);
      const a = tagStart(d.x, i, 'w:tc'); const b = d.x.indexOf('</w:tc>', i) + 7;
      d.x = d.x.slice(0, a) + cellWith(d.x.slice(a, b), text) + d.x.slice(b);
    },
    rowBounds(needle) {
      const i = must(d.x.indexOf(needle), needle);
      return [tagStart(d.x, i, 'w:tr'), d.x.indexOf('</w:tr>', i) + 7];
    },
    removeRow(needle) {
      const [a, b] = d.rowBounds(needle);
      d.x = d.x.slice(0, a) + d.x.slice(b);
    },
    /** The row holding `needle` becomes the repeated row, marked <!--ROW-->…<!--/ROW-->. */
    rowTemplate(needle, placeholders) {
      const [a, b] = d.rowBounds(needle);
      const row = d.x.slice(a, b);
      const cells = row.match(CELL);
      if (cells.length !== placeholders.length) throw new Error(`row has ${cells.length} cells, ${placeholders.length} expected`);
      let out = row;
      cells.forEach((c, k) => { out = out.replace(c, cellWith(c, placeholders[k])); });
      d.x = d.x.slice(0, a) + `<!--ROW-->${out}<!--/ROW-->` + d.x.slice(b);
    },
    /** Replaces exact <w:t> texts inside the row holding `needle`. */
    inRow(needle, pairs) {
      const [a, b] = d.rowBounds(needle);
      let row = d.x.slice(a, b);
      for (const [from, to] of pairs) {
        if (!row.includes(`<w:t>${from}</w:t>`)) throw new Error(`"${from}" not in row ${needle}`);
        row = row.replace(`<w:t>${from}</w:t>`, `<w:t>${to}</w:t>`);
      }
      d.x = d.x.slice(0, a) + row + d.x.slice(b);
    },
    expect(placeholders, leftovers) {
      for (const p of placeholders) if (!d.x.includes(p)) throw new Error(`missing ${p}`);
      if (leftovers.test(d.x)) throw new Error('sample data left in the template');
    },
  };
  return d;
}

/** Drops the embedded fonts (several MB): Word substitutes the same families. */
export async function stripFonts(zip) {
  for (const f of Object.keys(zip.files)) if (f.startsWith('word/fonts/')) zip.remove(f);
  zip.remove('word/_rels/fontTable.xml.rels');
  zip.file('word/fontTable.xml', (await zip.file('word/fontTable.xml').async('string')).replace(/<w:embed(Regular|Bold|Italic|BoldItalic)\b[^>]*\/>/g, ''));
  zip.file('word/settings.xml', (await zip.file('word/settings.xml').async('string')).replace(/<w:embedTrueTypeFonts\b[^>]*\/>|<w:saveSubsetFonts\b[^>]*\/>/g, ''));
  zip.file('[Content_Types].xml', (await zip.file('[Content_Types].xml').async('string')).replace(/<Default Extension="odttf"[^>]*\/>/g, ''));
}
