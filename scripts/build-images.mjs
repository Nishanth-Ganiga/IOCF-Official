// Builds optimized portrait assets from the IOCF logo in the project root.
// "IOCF logo.png" is a transparent PNG, so it is used directly as the cutout.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const OUT = 'public/assets';
mkdirSync(OUT, { recursive: true });

const cutout = await sharp('IOCF logo.png').ensureAlpha().png().toBuffer();

for (const w of [1100, 720, 420]) {
  await sharp(cutout).resize({ width: w }).webp({ quality: 86, alphaQuality: 90 }).toFile(`${OUT}/portrait-${w}.webp`);
}

// Social share image (1200x630) on a dark backdrop
const portrait = await sharp(cutout).resize({ height: 600 }).png().toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 4, background: '#07070a' } })
  .composite([
    {
      input: Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs><radialGradient id="g" cx="78%" cy="45%" r="45%"><stop offset="0" stop-color="#e5132b" stop-opacity="0.45"/><stop offset="1" stop-color="#e5132b" stop-opacity="0"/></radialGradient></defs>
        <rect width="1200" height="630" fill="url(#g)"/>
      </svg>`),
    },
    { input: portrait, gravity: 'southeast' },
    {
      input: Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <text x="72" y="300" font-family="Impact, 'Arial Narrow', sans-serif" font-size="128" fill="#f4f1ec" letter-spacing="4">IOCF</text>
        <text x="78" y="352" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="17" fill="#ff3d5a" letter-spacing="2">INTERNATIONAL ONLINE CRICKET FEDERATION</text>
        <text x="78" y="420" font-family="Helvetica, Arial, sans-serif" font-weight="600" font-size="14" fill="#a7a6ad" letter-spacing="2">GOVERNING BODY • ONLINE CRICKET • WORLDWIDE</text>
      </svg>`),
    },
  ])
  .jpeg({ quality: 85 })
  .toFile(`${OUT}/og-image.jpg`);
console.log('images built');
