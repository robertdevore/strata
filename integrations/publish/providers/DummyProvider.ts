import type { PublishProvider } from '../PublishProvider'

export class DummyProvider implements PublishProvider {
	id = 'dummy'
	displayName = 'Dummy Provider (No-op)'

	async publish() {
		return {
			success: false,
			message: 'Publishing is not enabled yet. Integrations are scaffolded for future providers.',
		}
	}
}
