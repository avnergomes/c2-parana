// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteCompression from 'vite-plugin-compression'
import path from 'path'
import pkg from './package.json'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    viteCompression({ algorithm: 'gzip', ext: '.gz' }),
    viteCompression({ algorithm: 'brotliCompress', ext: '.br' }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Base path para GitHub Pages — derivado do nome do package
  // Se o repo mudar de nome, atualizar o "name" no package.json
  base: mode === 'production' ? `/${pkg.name}/` : '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          maps: ['leaflet', 'react-leaflet'],
          charts: ['recharts', 'd3'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 3000,
    headers: {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://firms.modaps.eosdis.nasa.gov",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://apitempo.inmet.gov.br https://info.dengue.mat.br https://firms.modaps.eosdis.nasa.gov https://api.waqi.info https://servicodados.ibge.gov.br https://precos-diarios-api.onrender.com https://*.ingest.sentry.io",
        "frame-src 'self' https://js.stripe.com",
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; '),
    },
  },
}))
