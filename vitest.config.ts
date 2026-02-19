import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		include: ['app/renderer/src/tests/**/*.test.ts'],
	},
})
