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
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
