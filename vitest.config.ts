import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	resolve: {
		alias: {
			'@renderer': path.resolve(__dirname, 'app/renderer'),
			'@main': path.resolve(__dirname, 'app/main'),
			'@preload': path.resolve(__dirname, 'app/preload'),
			'@shared': path.resolve(__dirname, 'app/shared'),
		},
	},
	test: {
		environment: 'node',
		include: ['app/renderer/src/tests/**/*.test.ts'],
	},
})
