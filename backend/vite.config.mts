import { defineConfig } from 'vite';
import path from 'path';

/** Asset-only Vite build (Phase 6) — not an SPA application shell. */
export default defineConfig({
  root: path.resolve(__dirname, 'src/web/client'),
  build: {
    outDir: path.resolve(__dirname, 'src/web/public/assets'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/web/client/portal.ts'),
      output: {
        entryFileNames: 'portal.js',
        assetFileNames: 'portal[extname]',
      },
    },
  },
});
