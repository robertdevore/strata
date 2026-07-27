/// <reference types="vite/client" />

import type { StrataApi } from '@preload/api'

declare global {
	interface Window {
		strata: StrataApi
	}
}

export {}
