/// <reference types="vite/client" />

import type { StrataApi } from '@preload/api'

declare global {
	const __APP_VERSION__: string

	interface Window {
		strata: StrataApi
	}
}

export {}
