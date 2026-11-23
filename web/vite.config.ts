import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildDefine } from '../extension/build-info';
import pkg from './package.json' with { type: 'json' };

// The web approval page: the same 1-or-2 + PIN check as the phone menu, for when a call cannot reach
// the approver (Twilio trial accounts only call verified numbers, so judges use this page).
export default defineConfig({
  plugins: [react()],
  // Version, commit and build time, shown at the foot of each page.
  define: buildDefine(pkg.version),
});
