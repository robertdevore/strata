import { ALL_CHANGED, NO_CHANGED, mergeChanged, type ChangedDomains } from '../../shared/changedDomains'
export { ALL_CHANGED, type ChangedDomains } from '../../shared/changedDomains'
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
  z.object({ op: z.literal('restore_note'), id: idSchema, expectedRevision: revisionSchema }),
  z.object({ op: z.literal('create_project'), name: z.string().trim().min(1).max(120) }),
  z.object({ op: z.literal('rename_project'), id: idSchema, name: z.string().trim().min(1).max(120) }),
  z.object({ op: z.literal('delete_project'), id: idSchema }),
  z.object({ op: z.literal('reorder_projects'), projectIds: z.array(idSchema).min(1).max(1000) }),
])

export const importSchema = z
  .object({
    projectName: z.string().trim().min(1).max(120),
    files: z
      .array(z.object({ name: z.string().min(1).max(255), content: z.string().max(790000) }).strict())
      .min(1)
      .max(50),
  })
  .strict()
  .refine(
    (value) =>
      value.files.reduce((size, file) => size + Buffer.byteLength(file.content), 0) <= 8 * 1024 * 1024,
    'Import exceeds 8 MiB',
  )

const derive_title_from_markdown = (content: string, fallback_name: string): string => {
  const trimmed_lines = content.split(/\r?\n/).map((line) => line.trim())
  for (const line of trimmed_lines) {
    if (!line) continue
    if (line.startsWith('# ')) {
      return line.slice(2).trim() || fallback_name
    }
    return line.replace(/^#+\s*/, '').trim() || fallback_name
  }
  return fallback_name
}

const normalize_markdown_content = (content: string, fallback_name: string): string => {
  const trimmed = content.trim()
  if (!trimmed) {
    return `# ${fallback_name}\n\n`
  }
  const first_non_empty = trimmed.split(/\r?\n/).find((line) => line.trim().length > 0) ?? ''
  if (first_non_empty.startsWith('# ')) return content
  const title = derive_title_from_markdown(content, fallback_name)
  return `# ${title}\n\n${content}`
}

export type Operation = z.infer<typeof operationSchema>
export const batchSchema = z
  .object({ operations: z.array(operationSchema).min(1).max(50), dryRun: z.boolean().optional() })
  .strict()
export const operationChanges = (operation: Operation): ChangedDomains => {
  switch (operation.op) {
    case 'create_project':
    case 'reorder_projects':
      return { ...NO_CHANGED, projects: true }
    case 'rename_project':
      // Project names participate in note search results.
      return { ...NO_CHANGED, projects: true, notes: true }
    case 'delete_project':
      return { ...NO_CHANGED, projects: true, notes: true, history: true, links: true }
    case 'update_note': {
      const patch = operation.payload
      return {
        notes: true,
        history: true,
        projects: patch.projectId !== undefined || patch.projectName !== undefined,
        tags: patch.tags !== undefined || patch.archived !== undefined,
        links: true,
      }
    }
    default:
      return { ...ALL_CHANGED }
  }
}

export class KnowledgeService {
  readonly db: StrataDatabase
  private notify?: (changed: ChangedDomains) => void
  constructor(db: StrataDatabase, notify?: (changed: ChangedDomains) => void) {
    this.db = db
    this.notify = notify
  }
  resolveLinkedNote(input: unknown): import('../../shared/types').WikiLinkResolution {
    const title = z
      .string()
      .trim()
      .min(1)
      .max(500)
      .regex(/^[^\r\n]+$/)
      .parse(input)
    const matches = this.db.findNoteSummariesByTitle(title)
    if (matches.length === 0) return { status: 'missing' }
    if (matches.length === 1) return { status: 'resolved', note: matches[0] }
    return { status: 'ambiguous', matches }
  }

  createMissingLinkedNote(input: unknown) {
    const title = z
      .string()
      .trim()
      .min(1)
      .max(500)
      .regex(/^[^\r\n]+$/)
      .parse(input)
    let created = false
    const note = this.db.transaction(() => {
      const resolution = this.resolveLinkedNote(title)
      if (resolution.status === 'ambiguous')
        throw new DomainError('AMBIGUOUS_TITLE', 'Multiple notes have this title. Choose a note explicitly.')
      if (resolution.status === 'resolved') return this.db.getNote(resolution.note.id)!
      created = true
      return this.db.createNote({ content: `# ${title}\n\n` })
    }, 'human')
    if (created) this.notify?.(ALL_CHANGED)
    return note
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
      case 'restore_note': {
        const note = db.aiGetNoteById(operation.id, true)
        if (!note) throw new DomainError('NOT_FOUND', 'Note not found')
        db.assertRevision(note, operation.expectedRevision)
        return db.restoreNote(operation.id)
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
  capture(input: unknown) {
    const parsed = z
      .object({
        payload: createSchema,
        dedupe: z.boolean().default(true),
        dryRun: z.boolean().default(false),
      })
      .strict()
      .parse(input)
    const result = this.db.executeOperation(
      () => {
        const { projectName, ...payload } = parsed.payload
        if (projectName && payload.projectId !== undefined)
          throw new DomainError('VALIDATION_ERROR', 'Specify projectId or projectName, not both')
        if (projectName)
          payload.projectId =
            this.db.getProjectByName(projectName)?.id ?? this.db.createProject(projectName).id
        const existing = parsed.dedupe
          ? this.db.findCaptureDuplicate(payload.content ?? '', payload.projectId ?? null)
          : null
        const note = existing ?? this.db.createNote(payload)
        return { note: this.db.summarize(note), duplicate: Boolean(existing), dryRun: parsed.dryRun }
      },
      {
        source: 'agent',
        dryRun: parsed.dryRun,
        fingerprint: createHash('sha256').update(JSON.stringify(parsed)).digest('hex'),
      },
    )
    if (!parsed.dryRun && !result.duplicate) this.notify?.(ALL_CHANGED)
    return result
  }
  importFolder(input: unknown, options: { dryRun?: boolean; key?: string } = {}) {
    const parsed = importSchema.parse(input)
    let applied = false
    const result = this.db.executeOperation(
      () => {
        const project = this.apply({
          op: 'create_project',
          name: parsed.projectName,
        }) as import('../../shared/types').Project
        const notes = parsed.files.map(
          (file) =>
            this.apply({
              op: 'create_note',
              payload: createSchema.parse({
                content: normalize_markdown_content(file.content, file.name.replace(/\.md$/i, '')),
                projectId: project.id,
              }),
            }) as import('../../shared/types').Note,
        )
        applied = true
        return { project, notes, count: notes.length }
      },
      {
        ...options,
        source: 'import',
        fingerprint: createHash('sha256').update(JSON.stringify(parsed)).digest('hex'),
      },
    )
    if (!options.dryRun && applied) this.notify?.(ALL_CHANGED)
    return result
  }
  propose(
    input: unknown,
    actor?: { threadId?: string; messageId?: string; model?: string },
  ): { id: string; operation: Operation; before: unknown; after: unknown } {
    const operation = operationSchema.parse(input)
    return this.db.transaction(() => {
      if (actor?.threadId && !this.db.getAiThread(actor.threadId))
        throw new DomainError('CANCELLED', 'Chat was deleted')
      const before =
        operation.op === 'update_note' || operation.op === 'delete_note' || operation.op === 'restore_note'
          ? this.db.aiGetNoteById(operation.id, true)
          : operation.op === 'rename_project' || operation.op === 'delete_project'
            ? this.db.getProject(operation.id)
            : operation.op === 'reorder_projects'
              ? this.db.listProjects()
              : null
      const after = this.mutate(operation, { source: 'ai', dryRun: true })
      const proposal = { operation, before, after, actor }
      const id = this.db.createProposal(proposal)
      return { id, ...proposal }
    })
  }
  approve(id: string, approved: boolean): unknown {
    let changed: ChangedDomains | undefined
    const result = this.db.resolveProposal(idSchema.parse(id), approved, (payload) => {
      const proposal = z.object({ operation: operationSchema }).parse(payload)
      const result = this.apply(proposal.operation)
      changed = operationChanges(proposal.operation)
      return result
    })
    if (approved && changed) this.notify?.(changed)
    return result
  }

  mutate(input: unknown, options: { source?: string; key?: string; dryRun?: boolean } = {}): unknown {
    const operation = operationSchema.parse(input)
    const fingerprint = createHash('sha256').update(JSON.stringify(operation)).digest('hex')
    let applied = false
    const result = this.db.executeOperation(
      () => {
        const value = this.apply(operation)
        applied = true
        return value
      },
      { ...options, fingerprint },
    )
    if (!options.dryRun && applied) this.notify?.(operationChanges(operation))
    return result
  }
  batch(input: unknown, options: { source?: string; key?: string } = {}): unknown {
    const parsed = batchSchema.parse(input)
    const fingerprint = createHash('sha256').update(JSON.stringify(parsed)).digest('hex')
    let applied = false
    const result = this.db.executeOperation(
      () => {
        const results = parsed.operations.map((operation, index) => ({
          index,
          result: this.apply(operation),
        }))
        applied = true
        return results
      },
      { ...options, fingerprint, dryRun: parsed.dryRun },
    )
    if (!parsed.dryRun && applied) this.notify?.(mergeChanged(...parsed.operations.map(operationChanges)))
    return { results: result, dryRun: Boolean(parsed.dryRun) }
  }
}
