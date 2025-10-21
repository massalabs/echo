import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig({
  optimizeDeps: {
    include: ['react-dom', 'dot-object', 'copy-to-clipboard'],
  },
  plugins: [
    react(),

    nodePolyfills({
      // Whether to polyfill `node:` protocol imports.
      protocolImports: true,
    }),
    ViteImageOptimizer({
      // SVG optimization with SVGO
      svg: {
        multipass: true,
        plugins: [
          {
            name: 'preset-default',
            params: {
              overrides: {
                // Keep viewBox for responsive SVGs (important for your logo)
                removeViewBox: false,
                // Remove width/height attributes for better scalability
                removeDimensions: true,
                // Keep important attributes
                removeUselessStrokeAndFill: false,
                // Optimize paths but keep them readable
                convertPathData: {
                  floatPrecision: 2,
                },
              },
            },
          },
          // Sort attributes for better compression
          'sortAttrs',
        ],
      },
      // Process images from public directory and assets
      test: /\.(svg|png|jpg|jpeg|webp)$/,
      // Include files from both public and src directories
      include: ['**/*.svg', '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.webp'],
      // Exclude already optimized files
      exclude: ['**/*.min.*'],
      // Enable verbose logging
      logStats: true,
    }),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,

      pwaAssets: {
        disabled: false,
        config: true,
      },

      manifest: {
        name: 'echo',
        short_name: 'echo',
        description: 'Echo private messenger',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        categories: ['social', 'communication'],
      },

      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3MB (increased from default 2MB for crypto polyfills)
      },

      devOptions: {
        enabled: false,
        navigateFallback: 'index.html',
        suppressWarnings: true,
        type: 'module',
      },
    }),
  ],
});
