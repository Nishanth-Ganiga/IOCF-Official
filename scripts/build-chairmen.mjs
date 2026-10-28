// Builds square, face-centred chairman portraits from "Image Assests/Chairman Pictures" into public/chairmen/<board-slug>.webp.
// Source files are matched to boards by the country keyword in the file name.
import sharp from 'sharp';
import { mkdirSync, readdirSync } from 'node:fs';

const SRC = 'Image Assests/Chairman Pictures';
const OUT = 'public/chairmen';
const SIZE = 512;
mkdirSync(OUT, { recursive: true });

// file-name keyword -> board slug (see boardSlug in src/data/boards.ts)
const KEYS = {
  Afghan: 'afghanistan', Bangladeshi: 'bangladesh', Canadian: 'canada', Dutch: 'netherlands', England: 'england',
  Australian: 'australia', Irish: 'ireland', Italian: 'italy', Japanese: 'japan', Kenyan: 'kenya', Nepali: 'nepal',
  'New Zealand': 'new-zealand', Pakistan: 'pakistan', 'Papua New Guinea': 'papua-new-guinea', American: 'usa',
  Ugandan: 'uganda', Portuguese: 'portugal', Indian: 'india', Qatar: 'qatar', Scottish: 'scotland',
  'South Africa': 'south-africa', Spanish: 'spain', 'Sri Lankan': 'sri-lanka', UAE: 'uae', 'West Indies': 'west-indies',
  Zimbabwe: 'zimbabwe',
};
// Boards with two chairmen keep both people in a 2:1 frame (the UI widens the portrait box for them).
const WIDE = new Set(['south-africa']);

for (const file of readdirSync(SRC).filter((f) => f.endsWith('.png'))) {
  const key = Object.keys(KEYS).find((k) => file.includes(k));
  if (!key) { console.warn('no board for', file); continue; }
  const slug = KEYS[key];
  const img = sharp(`${SRC}/${file}`);
  const { width, height } = await img.metadata();
  if (WIDE.has(slug)) {
    const h = Math.round(width / 2);
    await img.extract({ left: 0, top: Math.round(Math.min(height - h, height * 0.02)), width, height: h }).resize(SIZE * 2, SIZE).webp({ quality: 82 }).toFile(`${OUT}/${slug}.webp`);
  } else {
    const side = Math.min(width, height);
    const top = Math.round(Math.min(height - side, height * 0.04));
    await img.extract({ left: Math.round((width - side) / 2), top, width: side, height: side }).resize(SIZE, SIZE).webp({ quality: 82 }).toFile(`${OUT}/${slug}.webp`);
  }
  console.log(slug);
}
