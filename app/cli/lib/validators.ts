import { z } from 'zod'

export const note_id_schema = z.string().uuid()

export const note_schema = z.object({
	id: note_id_schema,
	content: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	starred: z.boolean(),
	archived: z.boolean(),
	tags: z.array(z.string()),
	deletedAt: z.string().nullable(),
})

export const note_list_response_schema = z.object({
	notes: z.array(note_schema),
})

export const note_response_schema = z.object({
	note: note_schema,
})

export const delete_response_schema = z.object({
	deleted: z.boolean(),
})

export const tag_stats_response_schema = z.object({
	tags: z.array(z.object({
		name: z.string(),
		count: z.number(),
	})),
})

export const health_response_schema = z.object({
	ok: z.boolean(),
})

export const notes_filter_schema = z.object({
	query: z.string().trim().optional(),
	tag: z.string().trim().optional(),
	starred: z.boolean().optional(),
	archived: z.boolean().optional(),
	includeDeleted: z.boolean().optional(),
	limit: z.number().int().min(1).max(500).optional(),
})

export const note_create_patch_schema = z.object({
	content: z.string().trim().min(1).max(500000),
	tags: z.array(z.string().trim().min(1).max(64)).max(100).optional(),
	starred: z.boolean().optional(),
	archived: z.boolean().optional(),
})

export const note_update_patch_schema = z.object({
	content: z.string().trim().min(1).max(500000).optional(),
	tags: z.array(z.string().trim().min(1).max(64)).max(100).optional(),
	starred: z.boolean().optional(),
	archived: z.boolean().optional(),
})

export const route_decision_schema = z.object({
	route: z.enum(['cheap', 'premium', 'blocked']),
	intent: z.string(),
	confidence: z.number(),
	risk: z.enum(['low', 'medium', 'high']),
	requiresConfirmation: z.boolean(),
	reason: z.string(),
})

export const ensure_string = (value: unknown, field_name: string): string => {
	if ('string' !== typeof value || !value.trim()) {
		throw new Error(`${field_name} must be a non-empty string`)
	}
	return value
}
