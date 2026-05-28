import { describe, expect, it } from 'vitest'
import { note_create_patch_schema, note_id_schema, note_update_patch_schema } from '../../../../cli/lib/validators'

describe('cli validators', () => {
	it('validates uuid note ids', () => {
		expect(() => note_id_schema.parse('not-a-uuid')).toThrow()
		expect(note_id_schema.parse('00000000-0000-0000-0000-000000000000')).toBe('00000000-0000-0000-0000-000000000000')
	})

	it('requires content field for create payload', () => {
		expect(() => note_create_patch_schema.parse({ title: 'x', body: 'y' })).toThrow()
		expect(note_create_patch_schema.parse({ content: '# Title\n\nBody' }).content).toBe('# Title\n\nBody')
	})

	it('supports partial update payloads', () => {
		expect(note_update_patch_schema.parse({ starred: true }).starred).toBe(true)
	})
})
