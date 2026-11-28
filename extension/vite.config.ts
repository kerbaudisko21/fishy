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
    // Tests never use the real project in .env.local: no Firebase, no debug token, no network.
    env: {
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_PROJECT_ID: '',
      VITE_FIREBASE_APP_ID: '',
      VITE_APPCHECK_DEBUG_TOKEN: '',
    },
  },
});
