import { expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '@main/db'

it('reads only the recent thread window in chronological insertion order, including timestamp ties', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-recent-messages-'))
  const db = new StrataDatabase(directory)
  try {
    const thread = db.createAiThread('Recent history', 'fixture')
    const other = db.createAiThread('Other history', 'fixture')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T00:00:00Z'))
    for (let i = 0; i < 120; i++) {
      db.createAiMessage(thread.id, i % 2 ? 'assistant' : 'user', `Message ${i}`)
      db.createAiMessage(other.id, 'user', `Other ${i}`)
    }
    expect(db.listRecentAiMessages(thread.id, 3).map((message) => message.content)).toEqual([
      'Message 117',
      'Message 118',
      'Message 119',
    ])
    expect(db.listRecentAiMessages(thread.id)).toHaveLength(40)
    expect(db.listRecentAiMessages(thread.id, 100)).toHaveLength(100)
    expect(db.listAiMessages(thread.id)).toHaveLength(120)
    const large = db.createAiMessage(thread.id, 'assistant', 'Evidence ' + 'x'.repeat(10000))
    expect(
      db.listAiThreads().find((item) => item.thread.id === thread.id)?.lastMessage?.content,
    ).toHaveLength(240)
    expect(db.searchAiMessages('Evidence')[0].message.content).toHaveLength(240)
    expect(db.listRecentAiMessages(thread.id, 1)[0].content).toBe(large.content)
    for (const limit of [0, 101, 1.5, NaN]) expect(() => db.listRecentAiMessages(thread.id, limit)).toThrow()
  } finally {
    vi.useRealTimers()
    db.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
