import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import { StrataDatabase } from '../app/main/db/index'

// A deliberately adverse sparse-tag workload, separate from the original mixed benchmark.
const results = []
for (const count of [100, 1000, 10000, 50000]) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-related-bench-'))
  let db: StrataDatabase | undefined
  let fixture: Database.Database | undefined
  try {
    db = new StrataDatabase(directory)
    db.close()
    db = undefined
    fixture = new Database(path.join(directory, 'data/strata.sqlite'))
    fixture.pragma('foreign_keys = ON')
    fixture.function('strata_content_hash', { deterministic: true }, (content: string) =>
      createHash('sha256').update(content.replace(/\r\n/g, '\n').trim()).digest('hex'),
    )
    const insert = fixture.prepare(
      'INSERT INTO notes(id,content,title,normalized_title,tags,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
    )
    const id = (i: number) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`
    const timestamp = '2026-09-08T00:00:00.000Z'
    fixture.transaction(() => {
      for (let i = 0; i < count; i++) {
        const title = `Topic ${i}`
        const tags = i === count - 1 ? ['unique'] : i >= count - 3 ? ['rare'] : ['common', `bucket${i % 100}`]
        insert.run(
          id(i),
          `# ${title}\n\n` + 'Synthetic context with meaningful Markdown.\n\n'.repeat(40),
          title,
          title.toLowerCase(),
          JSON.stringify(tags),
          timestamp,
          timestamp,
        )
      }
    })()
    fixture.close()
    fixture = undefined
    db = new StrataDatabase(directory)
    const workloads = []
    for (const [name, target] of [
      ['dense', 0],
      ['rare', count - 3],
      ['noSharedTag', count - 1],
    ] as const) {
      // Warm query/statement caches before the timed samples.
      db.getRelatedNotes(id(target))
      const samples = []
      let found = 0
      for (let sample = 0; sample < 15; sample++) {
        const start = performance.now()
        found = db.getRelatedNotes(id(target)).length
        samples.push(performance.now() - start)
      }
      samples.sort((a, b) => a - b)
      workloads.push({ name, found, medianMs: samples[7], p95Ms: samples[14] })
    }
    results.push({ count, workloads, rss: process.memoryUsage().rss })
  } finally {
    fixture?.close()
    db?.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
}
console.log(
  JSON.stringify(
    {
      workload: 'related-sparse-tags-v1',
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      samples: 15,
      results,
    },
    null,
    2,
  ),
)
