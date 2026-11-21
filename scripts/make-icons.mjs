// Renders the brand SVGs into the PNG icons Chrome needs (it does not accept SVG icons).
// Usage: npm run icons
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const big = readFileSync(join(root, 'brand/logo-mark.svg'), 'utf8');
const small = readFileSync(join(root, 'brand/logo-mark-small.svg'), 'utf8');

const targets = [
  { svg: small, size: 16, out: 'extension/public/icons/icon-16.png' },
  { svg: small, size: 32, out: 'extension/public/icons/icon-32.png' },
  { svg: big, size: 48, out: 'extension/public/icons/icon-48.png' },
  { svg: big, size: 128, out: 'extension/public/icons/icon-128.png' },
  { svg: small, size: 32, out: 'web/public/favicon-32.png' },
  { svg: big, size: 180, out: 'web/public/apple-touch-icon.png' },
];

for (const { svg, size, out } of targets) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  const path = join(root, out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
  console.log(`${out} (${size}px)`);
}
