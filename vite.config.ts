import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API calls to the thin backend so the frontend stays same-origin
    // in dev (no CORS). The backend listens on 8787.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
