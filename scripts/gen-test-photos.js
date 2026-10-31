// Erzeugt Testfotos (4000×3000 JPEG, nummeriert, mit gestaffelten Zeitstempeln).
// Aufruf: node scripts/gen-test-photos.js <ordner> <anzahl>
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [dir, countArg] = process.argv.slice(2);
const count = Number(countArg || 20);
if (!dir) {
  console.error('Aufruf: node scripts/gen-test-photos.js <ordner> <anzahl>');
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });
const start = Date.now() - count * 60_000;

for (let i = 1; i <= count; i++) {
  const hue = (i * 37) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="3000">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},70%,55%)"/><stop offset="1" stop-color="hsl(${(hue + 90) % 360},70%,30%)"/>
    </linearGradient></defs>
    <rect width="4000" height="3000" fill="url(#g)"/>
    <text x="2000" y="1700" font-size="900" text-anchor="middle" fill="white" font-family="Arial" font-weight="bold">#${i}</text>
  </svg>`;
  const file = path.join(dir, `IMG_${String(i).padStart(4, '0')}.jpg`);
  let img = sharp(Buffer.from(svg));
  if (i === count) img = img.withMetadata({ orientation: 6 }); // letztes Bild hochkant per EXIF
  await img.jpeg({ quality: 90 }).toFile(file);
  const t = new Date(start + i * 60_000);
  fs.utimesSync(file, t, t);
}
console.log(`${count} Testfotos in ${dir}`);
