import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const package_json = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version: string }

export default defineConfig({
	root: path.resolve(__dirname, 'app/renderer'),
  define: {
    __APP_VERSION__: JSON.stringify(package_json.version),
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          codemirror: ['@codemirror/view', '@codemirror/state', '@codemirror/lang-markdown', '@codemirror/autocomplete', '@codemirror/theme-one-dark', '@uiw/react-codemirror'],
          markdown: ['react-markdown', 'remark-gfm'],
        },
      },
    },
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
