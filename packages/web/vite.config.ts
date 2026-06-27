import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The monorepo shares a single .env at the repo root.
  envDir: '../../',
  server: {
    port: 5173,
  },
});
