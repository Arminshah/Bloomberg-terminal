/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `--mode single` produces a build with every asset inlined, which
// scripts/artifact.mjs folds into one self-contained HTML file.
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [react()],
    build: single
      ? {
          outDir: 'dist-single',
          assetsInlineLimit: Number.MAX_SAFE_INTEGER,
          cssCodeSplit: false,
          modulePreload: false,
          rollupOptions: { output: { inlineDynamicImports: true } },
        }
      : { outDir: 'dist', chunkSizeWarningLimit: 1500 },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
