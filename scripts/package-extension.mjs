// Builds the extension for anyone to install, in demo mode, and zips it.
// Usage: npm run package   → release/fishy-extension-demo.zip
//
// The build carries no Firebase config and no App Check debug token: every VITE_ setting that could
// hold one is set to empty here, and settings already in the environment win over .env.local.
// So the zip is safe to publish. Without Firebase, the panel runs the synthetic demo company, the
// keyword reader stands in for Gemini (and says so), and calls are simulated.
// To see Firebase AI Logic run without installing anything, use the hosted page at /try.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'extension', 'dist-demo');
const zipPath = join(root, 'release', 'fishy-extension-demo.zip');

const blank = {
  VITE_FIREBASE_API_KEY: '',
  VITE_FIREBASE_AUTH_DOMAIN: '',
  VITE_FIREBASE_PROJECT_ID: '',
  VITE_FIREBASE_STORAGE_BUCKET: '',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '',
  VITE_FIREBASE_APP_ID: '',
  VITE_APPCHECK_DEBUG_TOKEN: '',
  VITE_DEMO_MODE: 'true',
};

rmSync(outDir, { recursive: true, force: true });
execFileSync('npx', ['vite', 'build', '--outDir', 'dist-demo', '--emptyOutDir'], {
  cwd: join(root, 'extension'),
  env: { ...process.env, ...blank },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
};
walk(outDir);

// Nothing secret may be in the zip: refuse if a Firebase web key ("AIza…") made it into the build.
for (const file of files) {
  if (/\.(js|json|html)$/.test(file) && /AIza[0-9A-Za-z_-]{20,}/.test(readFileSync(file, 'utf8'))) {
    throw new Error(`A Firebase key is in ${relative(root, file)}. The demo build must not carry one.`);
  }
}

// A plain zip writer (deflate), so packaging needs no extra tool on any platform.
const local = [];
const central = [];
let offset = 0;
// Zip dates are DOS dates: years since 1980, month, day.
const today = new Date();
const dosDate = ((today.getFullYear() - 1980) << 9) | ((today.getMonth() + 1) << 5) | today.getDate();
for (const file of files.sort()) {
  const name = Buffer.from(relative(outDir, file).split('\\').join('/'));
  const data = readFileSync(file);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(0, 6);
  head.writeUInt16LE(8, 8);
  head.writeUInt16LE(0, 10);
  head.writeUInt16LE(dosDate, 12);
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(packed.length, 18);
  head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(name.length, 26);
  head.writeUInt16LE(0, 28);
  local.push(head, name, packed);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0, 8);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt16LE(0, 12);
  entry.writeUInt16LE(dosDate, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(packed.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += head.length + name.length + packed.length;
}
const centralSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(dirname(zipPath), { recursive: true });
writeFileSync(zipPath, Buffer.concat([...local, ...central, end]));
console.log(`${relative(root, zipPath)}: ${files.length} files, demo mode, no Firebase config.`);
