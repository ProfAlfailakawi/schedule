import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  server: { hmr: process.env.DISABLE_HMR !== 'true' },
  build: {
    // Route chunks are intentionally small; the warning would only be noise.
    chunkSizeWarningLimit: 700,
    /* Split, so a stylesheet can leave the render-blocking path at all.
       `false` fused every sheet into one file, which silently swallowed the
       styles/deferred.css split: journey and print styles — needed by no first
       paint anywhere — were shipped inside the one file every screen must
       finish downloading before it may draw. With the default split, the entry
       keeps its single blocking stylesheet (the eight files index.css still
       imports, order intact) and the deferred pair becomes its own file that
       arrives in parallel. */
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // One-time deployment namespace. It forces every browser to request a
        // fresh executable asset after the production recovery change instead
        // of reusing a previously cached/truncated JavaScript file.
        entryFileNames: 'assets/recovery-20260812-[name]-[hash].js',
        chunkFileNames: 'assets/recovery-20260812-[name]-[hash].js',
        assetFileNames: 'assets/recovery-20260812-[name]-[hash][extname]',
        // React and the icon set change far less often than product code, so
        // they get their own long-lived chunk instead of invalidating on every
        // release.
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          if (id.includes('node_modules/lucide-react')) return 'icons';
        }
      }
    }
  }
});
