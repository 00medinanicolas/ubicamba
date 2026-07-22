import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // rutas relativas: la app funciona igual en / (dev) y bajo /ubicamba/ (GitHub Pages)
  base: './',
  plugins: [react()],
  server: { port: 5173 },
});
