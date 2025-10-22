import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'copy-wasm-files',
      generateBundle() {
        // Copy WASM file to build output
        const wasmSrc = resolve(process.cwd(), 'wasm/build/echo_wasm_bg.wasm');

        if (existsSync(wasmSrc)) {
          this.emitFile({
            type: 'asset',
            fileName: 'echo_wasm_bg.wasm',
            source: readFileSync(wasmSrc),
          });
        }
      },
    },
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
      },

      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm}'],
      },

      devOptions: {
        enabled: false,
        navigateFallback: 'index.html',
        suppressWarnings: true,
        type: 'module',
      },
    }),
  ],
  assetsInclude: ['**/*.wasm'],
  server: {
    fs: {
      allow: ['..'],
    },
  },
  build: {
    target: 'esnext',
  },
});
