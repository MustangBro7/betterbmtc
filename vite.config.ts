import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { port: 3000, proxy: { '/api': 'http://localhost:8787' } }, build: { rollupOptions: { output: { manualChunks: (id: string) => /node_modules\/(leaflet|react-leaflet|@react-leaflet)/.test(id) ? 'map' : undefined } } } });
