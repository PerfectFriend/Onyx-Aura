import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      {
        name: 'dev-sw-cleanup',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url && /^\/dev-sw\.js(\?|$)/.test(req.url)) {
              res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
              res.setHeader('Cache-Control', 'no-store');
              res.end(
                "self.addEventListener('install', () => self.skipWaiting());\n" +
                  "self.addEventListener('activate', (e) => e.waitUntil(self.registration.unregister()));\n"
              );
              return;
            }
            next();
          });
        },
      },
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'apple-touch-icon.png',
          '*.jpg',
          'assets/images/*.jpg',
          'src/assets/images/*.jpg',
        ],
        workbox: {
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,webmanifest}'],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'images-cache',
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 120,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
                },
              },
            },
          ],
        },
        manifest: {
          id: '/',
          name: 'Nailix - Haute Manicure Art Network',
          short_name: 'Nailix',
          description: 'Luxury Cyber-Gaudí manicure art showcase, studio radar, RFC 5545 booking export, and [SIM] interactive demo suite.',
          theme_color: '#07080d',
          background_color: '#07080d',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          categories: ['lifestyle', 'beauty', 'shopping', 'social'],
          shortcuts: [
            {
              name: 'Book Manicure',
              short_name: 'Book',
              description: 'Quick booking with certified master',
              url: '/?tab=explore&action=book',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
            {
              name: 'Artists Radar',
              short_name: 'Radar',
              description: 'Find closest nail studios and masters',
              url: '/?tab=map',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
            {
              name: 'AR Camera Try-on',
              short_name: 'AR Try-on',
              description: 'Live virtual nail fitting on camera',
              url: '/?tab=android&action=ar',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
            {
              name: 'Friend Jury [SIM]',
              short_name: 'Jury [SIM]',
              description: 'Simulated peer moderation quorum preview',
              url: '/?tab=moderation',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
          ],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
