import type { Note } from '../../app/shared/types'

export interface PublishProvider {
	id: string
	displayName: string
	publish: (note: Note, context: { tags: string[] }) => Promise<{ success: boolean; message: string }>
}
