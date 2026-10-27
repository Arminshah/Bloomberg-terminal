/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

/**
 * Content-Security-Policy for the hosted site and the desktop app: scripts only
 * from the app itself, network access only to the live data providers. The
 * single-file build inlines its scripts and runs inside a host page with its
 * own policy, so it is left out.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  // Yahoo's price stream is opened by the desktop app's page; its other requests go through the main process.
  "connect-src 'self' https://api.exchange.coinbase.com wss://ws-feed.exchange.coinbase.com https://api.frankfurter.dev https://finnhub.io wss://ws.finnhub.io wss://streamer.finance.yahoo.com",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

function csp(): Plugin {
  return {
    name: 'armin-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
  };
}

// `--mode single` produces a build with every asset inlined, which
// scripts/artifact.mjs folds into one self-contained HTML file.
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  // DEMO_MODE=true opens the browser build straight into the demo (simulated data, marked DEMO DATA). Off by
  // default; only this one switch is read from the environment into the page, never a key.
  const demo = /^(1|true|yes|on)$/i.test((process.env.DEMO_MODE ?? loadEnv(mode, process.cwd(), '').DEMO_MODE ?? '').trim());
  return {
    base: './',
    define: { __DEMO_MODE__: JSON.stringify(demo) },
    plugins: single ? [react()] : [react(), csp()],
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
      // The stylesheet as written, for tests/typeface.test.ts (other CSS stays empty in unit tests).
      css: { include: [/src\/styles\/global\.css/] },
    },
  };
});
