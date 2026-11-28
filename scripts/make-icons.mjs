// Renders the brand SVGs into the PNG icons Chrome needs (it does not accept SVG icons).
// Usage: npm run icons
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const big = readFileSync(join(root, 'brand/logo-mark.svg'), 'utf8');
const small = readFileSync(join(root, 'brand/logo-mark-small.svg'), 'utf8');
// The installed web app's maskable icon: full-bleed signal red, the mark shrunk into the safe zone
// (the middle 80% circle), so Android's round or squircle mask never cuts the loupe or the hole.
const inner = big.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>/, '');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><rect width="128" height="128" fill="#CF2419"/><g transform="translate(64 64) scale(0.66) translate(-64 -64)">${inner}</g></svg>`;

const targets = [
  { svg: small, size: 16, out: 'extension/public/icons/icon-16.png' },
  { svg: small, size: 32, out: 'extension/public/icons/icon-32.png' },
  { svg: big, size: 48, out: 'extension/public/icons/icon-48.png' },
  { svg: big, size: 128, out: 'extension/public/icons/icon-128.png' },
  { svg: small, size: 32, out: 'web/public/favicon-32.png' },
  { svg: big, size: 180, out: 'web/public/apple-touch-icon.png' },
  { svg: big, size: 192, out: 'web/public/icon-192.png' },
  { svg: big, size: 512, out: 'web/public/icon-512.png' },
  { svg: maskable, size: 512, out: 'web/public/icon-maskable-512.png' },
];

for (const { svg, size, out } of targets) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  const path = join(root, out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
  console.log(`${out} (${size}px)`);
}
