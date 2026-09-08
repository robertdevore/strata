import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '@main/db'
import { run_ai_turn } from '@main/ai/aiRunner'
const providers = vi.hoisted(() => ({ cheap: { sendTurn: vi.fn() }, premium: { sendTurn: vi.fn() } }))
vi.mock('@main/ai/providers/providerRegistry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@main/ai/providers/providerRegistry')>()),
  create_provider: (input: { presetId: string }) =>
    input.presetId === 'openai' ? providers.premium : providers.cheap,
}))
vi.mock('@main/ai/routing', () => ({
  route_ai_request: () => ({
    route: 'cheap',
    intent: 'retrieval',
    confidence: 1,
    risk: 'low',
    requiresConfirmation: false,
    reason: 'fixture',
  }),
}))
const cleanup: Array<() => void> = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.clearAllMocks()
})
const open = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-fallback-'))
  const db = new StrataDatabase(dir)
  cleanup.push(() => {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })
  db.setSettings({ aiRoutingMode: 'auto' })
  const thread = db.createAiThread('test', '')
  db.createAiMessage(thread.id, 'user', 'create a note')
  providers.cheap.sendTurn
    .mockReset()
    .mockResolvedValueOnce({
      content: '',
      toolCalls: [
        { id: 'create-1', name: 'create_note', argumentsJson: JSON.stringify({ content: '# Captured' }) },
      ],
    })
    .mockRejectedValueOnce(new Error('provider unavailable'))
  providers.premium.sendTurn.mockReset().mockResolvedValue({ content: 'Done', toolCalls: [] })
  return { db, thread }
}
describe('runner provider fallback', () => {
  it('passes only read tools through both providers in read-only mode', async () => {
    const { db, thread } = open()
    db.setSettings({ aiEditMode: 'read_only' })
    const result = await run_ai_turn(db, thread)
    for (const provider of [providers.cheap, providers.premium]) {
      expect(provider.sendTurn).toHaveBeenCalled()
      for (const [input] of provider.sendTurn.mock.calls) {
        expect(input.tools).toHaveLength(10)
        expect(input.tools.some((tool: { name: string }) => tool.name === 'create_note')).toBe(false)
        expect(input.tools.some((tool: { name: string }) => tool.name === 'get_note')).toBe(true)
      }
    }
    expect(result.changed.notes).toBe(false)
    expect(db.listProposals()).toEqual([])
    expect(db.listNotes()).toEqual([])
  })
  it('preserves pending approval state and tool protocol after cheap provider failure', async () => {
    const { db, thread } = open()
    const result = await run_ai_turn(db, thread)
    expect(result.content).toContain('awaiting your approval')
    expect(result.changed.notes).toBe(false)
    expect(db.listProposals()).toHaveLength(1)
    expect(db.listNotes()).toEqual([])
    expect(providers.premium.sendTurn.mock.calls[0][0].messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'tool', toolCallId: 'create-1' })]),
    )
    expect(result.routeLog?.fallbackUsed).toBe(true)
  })
  it('preserves applied writes without replaying the tool', async () => {
    const { db, thread } = open()
    db.setSettings({ aiEditMode: 'auto_apply' })
    const result = await run_ai_turn(db, thread)
    expect(result.changed.notes).toBe(true)
    expect(db.listNotes()).toHaveLength(1)
    expect(db.listRevisions(db.listNotes()[0].id)).toHaveLength(1)
  })
  it('keeps the total tool budget across providers and surfaces existing proposals at the limit', async () => {
    const { db, thread } = open()
    const calls = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `call-${index}`,
        name: 'create_note',
        argumentsJson: JSON.stringify({ content: `note ${index}` }),
      }))
    providers.cheap.sendTurn
      .mockReset()
      .mockResolvedValueOnce({ content: '', toolCalls: calls(20) })
      .mockRejectedValueOnce(new Error('offline'))
    providers.premium.sendTurn.mockReset().mockResolvedValueOnce({ content: '', toolCalls: calls(11) })
    const result = await run_ai_turn(db, thread)
    expect(result.content).toContain('Tool-call limit reached')
    expect(result.content).toContain('awaiting your approval')
    expect(db.listProposals()).toHaveLength(20)
    expect(db.listNotes()).toEqual([])
  })
  it('notifies committed writes even when both providers subsequently fail', async () => {
    const { db, thread } = open()
    db.setSettings({ aiEditMode: 'auto_apply' })
    providers.premium.sendTurn.mockReset().mockRejectedValue(new Error('premium offline'))
    const changed = vi.fn()
    await expect(run_ai_turn(db, thread, { onDataChanged: changed })).rejects.toThrow('premium offline')
    expect(changed).toHaveBeenCalledTimes(1)
    expect(db.listNotes()).toHaveLength(1)
  })
  it('does not escalate a cheap-only policy to a premium provider', async () => {
    const { db, thread } = open()
    db.setSettings({ aiRoutingMode: 'cheap_only' })
    await expect(run_ai_turn(db, thread)).rejects.toThrow('provider unavailable')
    expect(providers.premium.sendTurn).not.toHaveBeenCalled()
    expect(db.listProposals()).toHaveLength(1)
  })
  it('does not fall back after cancellation and preserves already committed notifications', async () => {
    const { db, thread } = open()
    db.setSettings({ aiEditMode: 'auto_apply' })
    const controller = new AbortController()
    const changed = vi.fn(() => controller.abort())
    await expect(
      run_ai_turn(db, thread, { signal: controller.signal, onDataChanged: changed }),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(changed).toHaveBeenCalledTimes(1)
    expect(db.listNotes()).toHaveLength(1)
    expect(providers.cheap.sendTurn).toHaveBeenCalledTimes(1)
    expect(providers.premium.sendTurn).not.toHaveBeenCalled()
  })
})
