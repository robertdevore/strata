import type { Note } from '../../app/shared/types'

export interface PublishContext {
	tags: string[]
	destination?: string
	title?: string
}

export interface PublishResult {
	success: boolean
	message: string
	path?: string
}

export interface PublishProvider {
	id: string
	displayName: string
	description: string
	/** Quick publish without destination (for providers that don't need a folder). */
	publish: (note: Note, context: PublishContext) => Promise<PublishResult>
	/** Whether this provider requires a destination folder. */
	requiresDestination: boolean
	/** Optional post-publish hook — e.g. run `ssg build` after writing files. Receives the published file path. */
	postPublish?: (publishedPath: string) => Promise<PublishResult>
}
