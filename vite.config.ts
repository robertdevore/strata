import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	root: path.resolve(__dirname, 'app/renderer'),
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: path.resolve(__dirname, 'app/main/main.ts'),
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist/main'),
            rollupOptions: {
              external: ['better-sqlite3'],
            },
          },
        },
      },
      preload: {
        input: path.resolve(__dirname, 'app/preload/preload.ts'),
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist/preload'),
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, 'app/renderer'),
      '@main': path.resolve(__dirname, 'app/main'),
      '@preload': path.resolve(__dirname, 'app/preload'),
      '@shared': path.resolve(__dirname, 'app/shared'),
    },
  },
})
