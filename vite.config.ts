/// <reference types="vitest" />

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { ManifestOptions } from 'vite-plugin-pwa';
import { VitePWA } from 'vite-plugin-pwa';

export const pwaManifest = {
  name: 'ChatOnPhone',
  short_name: 'ChatOnPhone',
  description: 'Personal Android PWA for OpenAI-compatible chat with image input.',
  theme_color: '#0f172a',
  background_color: '#f8fafc',
  display: 'standalone',
  start_url: '/',
  icons: [
    {
      src: '/icon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any maskable'
    }
  ]
} as const;

const pwaPluginManifest: Partial<ManifestOptions> = {
  ...pwaManifest,
  icons: pwaManifest.icons.map((icon) => ({ ...icon }))
};

const config = {
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: pwaPluginManifest,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  test: {
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    globals: true,
    css: true
  }
};

export default defineConfig(config);
