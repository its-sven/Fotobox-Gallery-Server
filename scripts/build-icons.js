// Erzeugt die PNG-Icons aus public/img/logo.svg. Nach Logo-Änderungen erneut ausführen:
//   node scripts/build-icons.js
import sharp from 'sharp';

const logo = 'public/img/logo.svg';
const render = (size) => sharp(logo, { density: 600 }).resize(size, size);

// Standard-Favicon (wird unter /favicon.ico ausgeliefert, solange kein eigenes hochgeladen ist)
await render(64).png().toFile('public/img/favicon.png');

// Home-Bildschirm-Icon (iOS/Android): Logo mit Rand auf hellem Grund
const inner = await render(140).png().toBuffer();
await sharp({ create: { width: 180, height: 180, channels: 4, background: '#f1f5f9' } })
  .composite([{ input: inner, left: 20, top: 20 }])
  .png()
  .toFile('public/img/apple-touch-icon.png');

// Logo für README/Docs
await render(256).png().toFile('docs/logo.png');

console.log('Icons erzeugt.');
