import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      includeAssets: ['tallykraft.svg', 'tallykraft.png'],
      manifest: {
        name: 'TallyKraft - Accounting Software',
        short_name: 'TallyKraft',
        description: 'Fully functional offline accounting software with GST and multi-business support.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        icons: [
          {
            src: 'tallykraft.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'tallykraft.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      }
    })
  ],
});
