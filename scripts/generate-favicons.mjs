// Generate favicon assets from the Oaziz logo.
// Outputs apple-touch-icon.png (180×180) and a 32×32 icon-512 set in public/.
// Re-run any time the logo changes: `node scripts/generate-favicons.mjs`

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const SOURCE = 'public/images/Oaziz-Logo.webp';

const targets = [
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
];

const ORANGE = { r: 208, g: 88, b: 38, alpha: 1 }; // brand orange

for (const { size, name } of targets) {
  const padding = Math.round(size * 0.08);
  const inner = size - padding * 2;

  const inner_resized = await sharp(SOURCE)
    .resize({ width: inner, height: inner, fit: 'contain', background: ORANGE })
    .toBuffer();

  const out = await sharp({
    create: { width: size, height: size, channels: 4, background: ORANGE },
  })
    .composite([{ input: inner_resized, top: padding, left: padding }])
    .png()
    .toBuffer();

  await writeFile(`public/${name}`, out);
  console.log(`  ${name}  (${out.length} bytes)`);
}
console.log('Done.');
