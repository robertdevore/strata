import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { StrataDatabase } from '../db'
import { DomainError } from '../../shared/errors'

export const idSchema = z.string().uuid()
export const revisionSchema = z.number().int().positive()
export const noteFields = {
  content: z.string().max(800000).optional(),
  tags: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  starred: z.boolean().optional(),
  archived: z.boolean().optional(),
  projectId: idSchema.nullable().optional(),
  projectName: z.string().trim().min(1).max(120).optional(),
}
export const createSchema = z.object(noteFields).strict()
export const updateSchema = createSchema.extend({ expectedRevision: revisionSchema }).strict()
export const listSchema = z
  .object({
    untagged: z.boolean().optional(),
    sort: z.enum(['updated_desc', 'created_desc', 'title_asc']).optional(),
    query: z.string().max(500).optional(),
    starred: z.boolean().optional(),
    archived: z.boolean().optional(),
    tag: z.string().max(120).optional(),
    projectId: idSchema.optional(),
    includeDeleted: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().max(4096).optional(),
  })
  .strict()
export const operationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create_note'), payload: createSchema, clientId: z.string().max(120).optional() }),
  z.object({
    op: z.literal('update_note'),
    id: idSchema,
    payload: updateSchema,
    clientId: z.string().max(120).optional(),
  }),
  z.object({ op: z.literal('delete_note'), id: idSchema, expectedRevision: revisionSchema }),
  z.object({ op: z.literal('create_project'), name: z.string().trim().min(1).max(120) }),
  z.object({ op: z.literal('rename_project'), id: idSchema, name: z.string().trim().min(1).max(120) }),
  z.object({ op: z.literal('delete_project'), id: idSchema }),
  z.object({ op: z.literal('reorder_projects'), projectIds: z.array(idSchema).min(1).max(1000) }),
])

export type Operation = z.infer<typeof operationSchema>
export const batchSchema = z
  .object({ operations: z.array(operationSchema).min(1).max(50), dryRun: z.boolean().optional() })
  .strict()
export type ChangedDomains = {
  notes: boolean
  projects: boolean
  tags: boolean
  links: boolean
  history: boolean
}
export const ALL_CHANGED: ChangedDomains = {
  notes: true,
  projects: true,
  tags: true,
  links: true,
  history: true,
}

export class KnowledgeService {
  readonly db: StrataDatabase
  private notify?: (changed: ChangedDomains) => void
  constructor(db: StrataDatabase, notify?: (changed: ChangedDomains) => void) {
    this.db = db
    this.notify = notify
  }
  private apply(operation: Operation): unknown {
    const db = this.db
    switch (operation.op) {
      case 'reorder_projects':
        return db.reorderProjects(operation.projectIds)
      case 'create_note': {
        const { projectName, ...payload } = operation.payload
        if (projectName && payload.projectId !== undefined)
          throw new DomainError('VALIDATION_ERROR', 'Specify projectId or projectName, not both')
        if (projectName)
          payload.projectId = db.getProjectByName(projectName)?.id ?? db.createProject(projectName).id
        return db.createNote(payload)
      }
      case 'update_note': {
        const note = db.getNote(operation.id)
        if (!note) throw new DomainError('NOT_FOUND', 'Note not found')
        db.assertRevision(note, operation.payload.expectedRevision)
        const { projectName, ...payload } = operation.payload
        if (projectName && payload.projectId !== undefined)
          throw new DomainError('VALIDATION_ERROR', 'Specify projectId or projectName, not both')
        if (projectName)
          payload.projectId = db.getProjectByName(projectName)?.id ?? db.createProject(projectName).id
        const updated = db.updateNote(operation.id, payload)
        if (!updated) throw new DomainError('NOT_FOUND', 'Note or project not found')
        return updated
      }
      case 'delete_note': {
        const note = db.getNote(operation.id)
        if (!note) throw new DomainError('NOT_FOUND', 'Note not found')
        db.assertRevision(note, operation.expectedRevision)
        return { deleted: db.deleteNote(operation.id) }
      }
      case 'create_project': {
        if (db.getProjectByName(operation.name))
          throw new DomainError('ALREADY_EXISTS', 'Project already exists')
        return db.createProject(operation.name)
      }
      case 'rename_project': {
        const project = db.renameProject(operation.id, operation.name)
        if (!project) throw new DomainError('CONFLICT', 'Project missing or duplicate name')
        return project
      }
      case 'delete_project': {
        if (!db.deleteProject(operation.id)) throw new DomainError('NOT_FOUND', 'Project not found')
        return { deleted: true }
      }
    }
  }
  propose(
    input: unknown,
    actor?: { threadId?: string; messageId?: string; model?: string },
  ): { id: string; operation: Operation; before: unknown; after: unknown } {
    const operation = operationSchema.parse(input)
    return this.db.transaction(() => {
      const before = operation.op === 'update_note' ? this.db.getNote(operation.id) : null
      const after = this.mutate(operation, { source: 'ai', dryRun: true })
      const proposal = { operation, before, after, actor }
      const id = this.db.createProposal(proposal)
      return { id, ...proposal }
    })
  }
  approve(id: string, approved: boolean): unknown {
    const result = this.db.resolveProposal(idSchema.parse(id), approved, (payload) => {
      const proposal = z.object({ operation: operationSchema }).parse(payload)
      return this.mutate(proposal.operation, { source: 'ai' })
    })
    if (approved) this.notify?.(ALL_CHANGED)
    return result
  }

  mutate(input: unknown, options: { source?: string; key?: string; dryRun?: boolean } = {}): unknown {
    const operation = operationSchema.parse(input)
    const fingerprint = createHash('sha256').update(JSON.stringify(operation)).digest('hex')
    const result = this.db.executeOperation(() => this.apply(operation), { ...options, fingerprint })
    if (!options.dryRun) this.notify?.(ALL_CHANGED)
    return result
  }
  batch(input: unknown, options: { source?: string; key?: string } = {}): unknown {
    const parsed = batchSchema.parse(input)
    const fingerprint = createHash('sha256').update(JSON.stringify(parsed)).digest('hex')
    const result = this.db.executeOperation(
      () => parsed.operations.map((operation, index) => ({ index, result: this.apply(operation) })),
      { ...options, fingerprint, dryRun: parsed.dryRun },
    )
    if (!parsed.dryRun) this.notify?.(ALL_CHANGED)
    return { results: result, dryRun: Boolean(parsed.dryRun) }
  }
}
