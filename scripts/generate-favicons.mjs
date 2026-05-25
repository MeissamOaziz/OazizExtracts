// Generate favicon assets from the Oaziz logo.
// The logo is already a circular orange badge on a transparent background,
// so we just resize it — no extra backdrop needed.
// Re-run any time the logo changes: `node scripts/generate-favicons.mjs`

import sharp from 'sharp';
import { writeFile, unlink } from 'node:fs/promises';

const SOURCE = 'public/images/Oaziz-Logo.webp';

const targets = [
  { size:  32, name: 'favicon-32.png' },
  { size:  96, name: 'favicon-96.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
];

const srcBuf = await (await import('node:fs/promises')).readFile(SOURCE);

for (const { size, name } of targets) {
  const out = await sharp(srcBuf)
    .resize({ width: size, height: size, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(`public/${name}`, out);
  console.log(`  ${name}  (${out.length} bytes)`);
}

// Clean up the orange "O" placeholder SVG if it's still around.
try {
  await unlink('public/favicon.svg');
  console.log('  removed placeholder favicon.svg');
} catch {}

console.log('Done.');
