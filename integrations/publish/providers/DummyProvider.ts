import type { PublishProvider, PublishContext, PublishResult } from '../PublishProvider'

export class DummyProvider implements PublishProvider {
	id = 'dummy'
	displayName = 'Dummy Provider (No-op)'
	description = 'Placeholder provider — publishing is not yet configured.'
	requiresDestination = false

	async publish(_note: unknown, _ctx: PublishContext): Promise<PublishResult> {
		return {
			success: false,
			message: 'Publishing is not enabled yet. Configure a provider in Settings.',
		}
	}
}
