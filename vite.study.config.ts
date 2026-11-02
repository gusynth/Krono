import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  root: 'src/study',
  publicDir: resolve('public'),
  base: './',
  plugins: [react()],
  build: { outDir: resolve('artifacts/dark-study/dist'), emptyOutDir: true },
  server: { host: '127.0.0.1' },
});
