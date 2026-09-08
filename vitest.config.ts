import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, 'app/renderer'),
      '@main': path.resolve(__dirname, 'app/main'),
      '@preload': path.resolve(__dirname, 'app/preload'),
      '@shared': path.resolve(__dirname, 'app/shared'),
    },
  },
  test: {
    // Native SQLite and CLI subprocess suites should not fan out across every host CPU.
    maxWorkers: 2,
    environment: 'node',
    include: ['app/renderer/src/tests/**/*.test.{ts,tsx}'],
  },
})
