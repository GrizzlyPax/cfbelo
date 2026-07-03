import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The web app lives under web/; the engine test suite stays at the repo root.
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  test: {
    dir: fileURLToPath(new URL('./tests', import.meta.url)),
  },
});
