/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// '@' → src. Design tokens are imported (not copied) from the read-only
// design_handoff (see src/index.css); Tailwind only references the CSS vars.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // allow importing the read-only design_handoff tokens from the repo root
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
    // Dev proxy: the client calls same-origin '/api/*' (see src/lib/api.ts) and
    // vite forwards to the NestJS API — avoids CORS without touching apps/api
    // (OD4). '/api' is stripped since the API routes have no such prefix.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3100',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
