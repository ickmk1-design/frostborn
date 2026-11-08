import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  define: {
    __IS_CAPACITOR__: JSON.stringify(true),
  },
});
