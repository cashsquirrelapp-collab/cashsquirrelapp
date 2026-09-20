import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: '../build/frontend', emptyOutDir: true, rollupOptions: { output: { manualChunks: { react: ['react','react-dom'], motion: ['motion/react'], validation: ['zod'] } } } },
  server: { fs: { allow: ['..'] }, hmr: process.env.DISABLE_HMR !== 'true' },
});
