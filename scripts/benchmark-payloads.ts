import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { AI_TOOLS, execute_tool_call, toolsForMode } from '../app/main/ai/tools'
import { budgetHistory } from '../app/main/ai/toolLoop'
import type { StrataDatabase } from '../app/main/db'
import type { Note } from '../app/shared/types'

// This measures serialization contracts, not database latency or model-token counts.
// Both executors receive the same deterministic synthetic knowledge through read-only fixtures.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseline = 'e2ca89b'
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
const original = (file: string) => git('show', `${baseline}:${file}`)
const current = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const toolsFile = 'app/main/ai/tools.ts'
const runnerFile = 'app/main/ai/aiRunner.ts'
const ipcFile = 'app/main/ipc/aiHandlers.ts'
const loopFile = 'app/main/ai/toolLoop.ts'
const evaluateModule = async (source: string): Promise<Record<string, unknown>> => {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
}
const expression = async (source: string, name: string): Promise<unknown> => {
  const tree = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true)
  let initializer: ts.Expression | undefined
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)
      initializer = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(tree)
  if (!initializer) throw new Error(`Source declaration missing: ${name}`)
  return (await evaluateModule(`export const value = ${initializer.getText(tree)}`)).value
}
const oldTools = (await evaluateModule(original(toolsFile))) as {
  AI_TOOLS: unknown[]
  execute_tool_call: (
    db: unknown,
    call: { id: string; name: string; argumentsJson: string },
  ) => { output: string }
}
const project = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Provider work',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sortOrder: 0,
}
const paragraph =
  'Provider routing keeps retrieval local and bounded. Read summaries, select a note, check its revision, then propose a change. Preserve recoverable history and distinguish pending approval from an applied write. 🧭\n\n'
const notes: Note[] = Array.from({ length: 100 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  title: `Provider routing ${index + 1}`,
  revision: 7,
  content: `# Provider routing ${index + 1}\n\n${paragraph.repeat(32)}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  starred: false,
  archived: false,
  tags: ['provider', 'decision'],
  projectId: project.id,
  deletedAt: null,
  contentLoaded: true,
}))
const oldNotes = notes.map((note) => ({
  id: note.id,
  content: note.content,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
  starred: note.starred,
  archived: note.archived,
  tags: note.tags,
  projectId: note.projectId,
  deletedAt: note.deletedAt,
}))
const fixture = (rows: typeof oldNotes | Note[]) => ({
  aiListNotes: (limit: number) => rows.slice(0, limit),
  aiSearchNotes: (_query: string, limit: number) => rows.slice(0, limit),
  listNotes: () => rows,
  listNoteSummaries: (filters: { limit?: number }) => rows.slice(0, filters.limit ?? 100),
  aiGetNoteById: (id: string) => rows.find((note) => note.id === id) ?? null,
  listProjects: () => [project],
  getProject: (id: string) => (id === project.id ? project : null),
  getProjectByName: (name: string) => (name === project.name ? project : null),
})
const beforeDb = fixture(oldNotes)
const afterDb = fixture(notes) as unknown as StrataDatabase
const cases: Array<{ name: string; args: Record<string, unknown> }> = [
  { name: 'list_notes', args: {} },
  { name: 'search_notes', args: { query: 'provider' } },
  { name: 'search_notes_by_tag', args: { tag: 'provider' } },
  { name: 'search_notes_by_project', args: { project_id: project.id } },
  { name: 'get_project', args: { project_id: project.id } },
  { name: 'get_note', args: { note_id: notes[0].id } },
]
const bytes = (value: string) => Buffer.byteLength(value, 'utf8')
const comparison = (before: string, after: string) => ({
  beforeBytes: bytes(before),
  afterBytes: bytes(after),
  reductionPercent: Number(((1 - bytes(after) / bytes(before)) * 100).toFixed(2)),
})
const toolOutputs = cases.map(({ name, args }) => {
  const call = { id: 'fixture', name, argumentsJson: JSON.stringify(args) }
  const before = oldTools.execute_tool_call(beforeDb, call).output
  const after = execute_tool_call(afterDb, call).output
  const beforeValue = JSON.parse(before)
  const afterValue = JSON.parse(after)
  if (beforeValue.error || afterValue.error) throw new Error(`Tool fixture rejected: ${name}`)
  return {
    tool: name,
    args,
    ...comparison(before, after),
    beforeNotes: beforeValue.notes?.length ?? (beforeValue.note ? 1 : 0),
    afterNotes: afterValue.notes?.length ?? (afterValue.note ? 1 : 0),
  }
})
const beforePrompt = (await expression(original(runnerFile), 'SYSTEM_PROMPT')) as string
const afterPrompt = (await expression(current(runnerFile), 'SYSTEM_PROMPT')) as string
const beforeOpenContext = (await expression(original(ipcFile), 'build_open_notes_context')) as (
  notes: Note[],
) => string
const afterOpenContext = (await expression(current(ipcFile), 'build_open_notes_context')) as (
  notes: Note[],
) => string
const beforeHistory = (await expression(original(loopFile), 'build_history_messages')) as (
  messages: Array<{ role: string; content: string }>,
) => unknown
const history = Array.from({ length: 40 }, (_, index) => ({
  role: index % 2 ? 'assistant' : 'user',
  content: `Conversation ${index + 1}\n${paragraph.repeat(16)}`,
}))
const oldHistoryJson = JSON.stringify(beforeHistory(history))
const newHistoryJson = JSON.stringify(budgetHistory(history))
const openNotes = notes.slice(0, 12)
const oldContext = beforeOpenContext(openNotes)
const newContext = afterOpenContext(openNotes)
const readOnlyCatalog = toolsForMode('read_only')
console.log(
  JSON.stringify(
    {
      kind: 'deterministic-payload-contracts',
      generatedAt: new Date().toISOString(),
      baselineCommit: git('rev-parse', baseline).trim(),
      currentCommit: git('rev-parse', 'HEAD').trim(),
      fixture: {
        notes: notes.length,
        noteContentBytes: bytes(notes[0].content),
        openNotes: openNotes.length,
        historyMessages: history.length,
        hash: hash(JSON.stringify(notes)),
      },
      sourceHashes: Object.fromEntries(
        [toolsFile, runnerFile, ipcFile, loopFile].map((file) => [
          file,
          { before: hash(original(file)), after: hash(current(file)) },
        ]),
      ),
      toolOutputs,
      systemPrompt: comparison(beforePrompt, afterPrompt),
      toolCatalog: {
        ...comparison(JSON.stringify(oldTools.AI_TOOLS), JSON.stringify(AI_TOOLS)),
        beforeTools: oldTools.AI_TOOLS.length,
        afterTools: AI_TOOLS.length,
        readOnlyTools: readOnlyCatalog.length,
        readOnlyBytes: bytes(JSON.stringify(readOnlyCatalog)),
      },
      openNoteContext: comparison(oldContext, newContext),
      historyContext: comparison(oldHistoryJson, newHistoryJson),
      combinedContextAndCatalog: comparison(
        beforePrompt + oldContext + oldHistoryJson + JSON.stringify(oldTools.AI_TOOLS),
        afterPrompt + newContext + newHistoryJson + JSON.stringify(AI_TOOLS),
      ),
      readOnlyCombinedBytes: bytes(
        afterPrompt + newContext + newHistoryJson + JSON.stringify(readOnlyCatalog),
      ),
      limitations: [
        'UTF-8 bytes, not model-specific token counts or latency; transport envelopes are excluded.',
        'Read-only deterministic fixture adapters supply identical ordered knowledge. This does not measure SQLite ranking or query performance.',
        'Default result counts and get_project semantics changed. Smaller outputs do not imply equivalent recall; callers can request more summaries or full notes explicitly.',
        'Current revisions/title/contentLoaded metadata increase the explicit full-note payload.',
        'Read-only and unknown modes advertise only read tools; confirm and auto_apply retain the full catalog.',
      ],
    },
    null,
    2,
  ),
)
