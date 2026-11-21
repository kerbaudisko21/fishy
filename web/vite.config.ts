import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The web approval page: the same 1-or-2 + PIN check as the phone menu, for when a call cannot reach
// the approver (Twilio trial accounts only call verified numbers, so judges use this page).
export default defineConfig({
  plugins: [react()],
});
