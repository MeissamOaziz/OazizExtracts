// One-shot image optimizer.
// Re-encodes all images > 300KB in public/images/ (recursive) using sharp.
//   - JPG/PNG → WebP at quality 82, max width 1600
//   - WebP → WebP at quality 82, max width 1600
//   - SVG and originally-small files left alone
//
// Usage: node scripts/optimize-images.mjs

import { readdir, readFile, stat, rename, unlink, writeFile } from 'node:fs/promises';
import { join, extname, dirname, basename } from 'node:path';
import sharp from 'sharp';

const ROOT = 'public/images';
const THRESHOLD = 300 * 1024; // 300 KB
const MAX_WIDTH = 1600;
const QUALITY = 82;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

let totalBefore = 0;
let totalAfter = 0;
let touched = 0;
let skipped = 0;

for await (const file of walk(ROOT)) {
  const ext = extname(file).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    skipped++;
    continue;
  }
  const s = await stat(file);
  if (s.size < THRESHOLD) {
    skipped++;
    continue;
  }

  totalBefore += s.size;
  const finalPath = ext === '.webp' ? file : join(dirname(file), basename(file, ext) + '.webp');

  try {
    // Read source fully into a buffer so the source file handle is closed
    // before we attempt to overwrite (Windows file-lock workaround).
    const srcBuf = await readFile(file);
    const img = sharp(srcBuf).rotate(); // rotate() applies EXIF orientation then strips it
    const meta = await img.metadata();
    const resized = meta.width && meta.width > MAX_WIDTH ? img.resize({ width: MAX_WIDTH }) : img;
    const outBuf = await resized.webp({ quality: QUALITY, effort: 5 }).toBuffer();

    await writeFile(finalPath, outBuf);
    if (finalPath !== file) {
      try { await unlink(file); } catch {}
    }

    totalAfter += outBuf.length;
    touched++;
    const pct = ((1 - outBuf.length / s.size) * 100).toFixed(0);
    console.log(`  ${file}  ${(s.size/1024).toFixed(0)}KB → ${(outBuf.length/1024).toFixed(0)}KB  (-${pct}%)`);
  } catch (e) {
    console.error(`  FAIL ${file}: ${e.message}`);
    skipped++;
  }
}

console.log('---');
console.log(`Touched: ${touched}   Skipped: ${skipped}`);
console.log(`Before: ${(totalBefore/1024/1024).toFixed(2)} MB`);
console.log(`After:  ${(totalAfter/1024/1024).toFixed(2)} MB`);
console.log(`Saved:  ${((totalBefore-totalAfter)/1024/1024).toFixed(2)} MB`);
