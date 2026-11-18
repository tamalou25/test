import { defineConfig } from 'vite';

// base './' : le jeu est servi depuis app://seguia/ (Electron) ou un simple serveur statique.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2500,
    sourcemap: false,
  },
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120000,
  },
} as any);
