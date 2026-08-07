import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Baato — Edu Navigator',
        short_name: 'Baato',
        description:
          'Honest answers about studying abroad, from students who actually went.',
        theme_color: '#17202A',
        background_color: '#FAFAF7',
        display: 'standalone',
        lang: 'ne',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        // Reading works offline. Writes queue and replay (handled in app layer).
        globPatterns: ['**/*.{js,css,html,woff2,svg}'],
        runtimeCaching: [
          {
            // Frozen shortlist results: cache-first, permanent.
            urlPattern: /\/s\/[\w-]+$/,
            handler: 'CacheFirst',
            options: { cacheName: 'shortlist-results' },
          },
          {
            // Feed / read data: stale-while-revalidate.
            urlPattern: /\/rest\/v1\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'supabase-read' },
          },
        ],
      },
    }),
  ],
  build: {
    // Performance budget lives in CI; keep chunks small via route splitting.
    chunkSizeWarningLimit: 150,
  },
});
