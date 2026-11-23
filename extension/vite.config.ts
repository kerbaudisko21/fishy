import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.ts';
import { buildDefine } from './build-info.ts';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  // Version, commit and build time, shown in Settings.
  define: buildDefine(pkg.version),
  server: {
    port: 5173,
    strictPort: true,
    cors: { origin: [/chrome-extension:\/\//] },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
