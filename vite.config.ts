/// <reference types="vitest" />

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { ManifestOptions } from 'vite-plugin-pwa';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

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
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: pwaPluginManifest,
      workbox: {
        // 只预缓存应用外壳（HTML/CSS/图标）。JS 分块不进 precache：
        // Shiki 把 ~300 个语言/主题高亮分块（约 9.9MB）打进 assets，
        // 它们本就是按需懒加载的，全量预缓存会让首屏 SW 安装极慢。
        globPatterns: ['**/*.{css,html,svg,png,ico,webmanifest}'],
        // 单文件预缓存上限放宽，确保较大的 CSS 也能进 precache。
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // 同源 JS 分块（含入口与按需的语言/主题分块）：首次用到时缓存，
            // 之后离线可用。文件名带 hash，内容不可变，可放心长期缓存。
            urlPattern: ({ request, url }) =>
              request.destination === 'script' && url.pathname.startsWith('/assets/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'asset-scripts',
              expiration: {
                maxEntries: 400,
                maxAgeSeconds: 30 * 24 * 60 * 60
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
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
