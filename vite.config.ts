import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    // Local work: the four server functions run with `npm run dev:server` (README).
    proxy: { '/api': process.env.QURTAG_API_PROXY ?? 'http://127.0.0.1:56861' },
  },
});
