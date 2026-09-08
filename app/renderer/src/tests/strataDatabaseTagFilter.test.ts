import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '@main/db'

let tmpDir: string
let db: StrataDatabase

const noteIds: string[] = []

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-tagfilter-'))
  db = new StrataDatabase(tmpDir)
})

afterAll(() => {
  db.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

afterEach(() => {
  for (const id of noteIds.splice(0)) {
    db.deleteNote(id)
  }
})

const makeNote = (tags: string[]): string => {
  const created = db.createNote({ content: '# Note\n\nbody', tags })
  noteIds.push(created.id)
  return created.id
}

describe('listNotes tag filter exact match', () => {
  it('returns only notes whose tag list contains the exact tag, never a substring match', () => {
    const exactBar = makeNote(['bar'])
    const barTwo = makeNote(['bar2'])
    const foobar = makeNote(['foobar'])
    const barbar = makeNote(['barbar'])
    const unrelated = makeNote(['unrelated'])
    const multiTag = makeNote(['work', 'bar', 'ideas'])

    const ids = db.listNotes({ tag: 'bar' }).map((n) => n.id)

    expect(ids).toContain(exactBar)
    expect(ids).toContain(multiTag)
    expect(ids).not.toContain(barTwo)
    expect(ids).not.toContain(foobar)
    expect(ids).not.toContain(barbar)
    expect(ids).not.toContain(unrelated)
  })

  it('does not match the empty array as if it contained the tag', () => {
    const empty = makeNote([])
    noteIds.push(empty)
    const ids = db.listNotes({ tag: 'foo' }).map((n) => n.id)
    expect(ids).not.toContain(empty)
  })

  it('treats an unknown tag as a no-op (returns nothing for that tag)', () => {
    const tagged = makeNote(['known'])
    noteIds.push(tagged)
    const ids = db.listNotes({ tag: 'definitely-not-a-tag' }).map((n) => n.id)
    expect(ids).toEqual([])
  })

  it('preserves other filters while applying the exact tag match', () => {
    const starredMatch = makeNote(['bar'])
    const starredNoMatch = makeNote(['bar2'])
    const unstarredMatch = makeNote(['bar'])
    db.updateNote(starredMatch, { starred: true })
    db.updateNote(starredNoMatch, { starred: true })
    db.updateNote(unstarredMatch, { starred: false })

    const ids = db.listNotes({ tag: 'bar', starred: true }).map((n) => n.id)
    expect(ids).toContain(starredMatch)
    expect(ids).not.toContain(starredNoMatch)
    expect(ids).not.toContain(unstarredMatch)
  })

  it('listNoteSummaries applies the same exact tag match', () => {
    const exact = makeNote(['alpha'])
    const substring = makeNote(['alpha-beta'])
    const ids = db.listNoteSummaries({ tag: 'alpha' }).map((n) => n.id)
    expect(ids).toContain(exact)
    expect(ids).not.toContain(substring)
  })

  it('does not interpret LIKE wildcards in the filter tag', () => {
    const exact = makeNote(['bar%'])
    const otherTag = makeNote(['bar2'])
    const exactUnderscore = makeNote(['a_b'])
    const otherUnderscore = makeNote(['axb'])

    // Filter "bar%" must only match the note that has the literal tag "bar%".
    const percentIds = db.listNotes({ tag: 'bar%' }).map((n) => n.id)
    expect(percentIds).toContain(exact)
    expect(percentIds).not.toContain(otherTag)

    // Filter "a_b" must only match notes tagged exactly "a_b", not "axb".
    const underscoreIds = db.listNotes({ tag: 'a_b' }).map((n) => n.id)
    expect(underscoreIds).toContain(exactUnderscore)
    expect(underscoreIds).not.toContain(otherUnderscore)
  })
})

describe('database filtering and wiki-link indexing', () => {
  it('honors starred=false for full notes and summaries', () => {
    const starred = makeNote(['star-filter'])
    const unstarred = makeNote(['star-filter'])
    db.updateNote(starred, { starred: true })

    for (const result of [
      db.listNotes({ tag: 'star-filter', starred: false }),
      db.listNoteSummaries({ tag: 'star-filter', starred: false }),
    ]) {
      expect(result.map((note) => note.id)).toContain(unstarred)
      expect(result.map((note) => note.id)).not.toContain(starred)
    }
  })

  it('treats SQL wildcard characters as literal search text', () => {
    const percent = db.createNote({ content: '# Percent\n\n100% complete' })
    const underscore = db.createNote({ content: '# Underscore\n\na_b' })
    const unrelated = db.createNote({ content: '# Other\n\nplain text' })
    noteIds.push(percent.id, underscore.id, unrelated.id)

    expect(db.listNotes({ query: '%' }).map((note) => note.id)).toEqual([percent.id])
    expect(db.listNoteSummaries({ query: '_' }).map((note) => note.id)).toEqual([underscore.id])
    expect(db.aiSearchNotes('%').map((note) => note.id)).toEqual([percent.id])
  })

  it('indexes wiki links supplied when a note is created', () => {
    const target = db.createNote({ content: '# Direct Target' })
    const source = db.createNote({ content: '# Direct Source\n\n[[Direct Target]]' })
    noteIds.push(target.id, source.id)

    expect(db.getBacklinks(target.id).map((entry) => entry.source.id)).toEqual([source.id])
  })

  it('resolves links to notes whose title is a lower-level heading', () => {
    const target = db.createNote({ content: 'intro\n\n## Lower Heading' })
    const source = db.createNote({ content: '# Heading Source\n\n[[Lower Heading]]' })
    noteIds.push(target.id, source.id)

    expect(db.getBacklinks(target.id).map((entry) => entry.source.id)).toEqual([source.id])
  })

  it('resolves previously missing link targets when the target is created later', () => {
    const source = db.createNote({ content: '# Early Source\n\n[[Later Target]]' })
    const target = db.createNote({ content: '# Later Target' })
    noteIds.push(source.id, target.id)

    expect(db.getBacklinks(target.id).map((entry) => entry.source.id)).toEqual([source.id])
  })

  it('removes stale inbound targets after a target note is renamed', () => {
    const target = db.createNote({ content: '# Original Target' })
    const source = db.createNote({ content: '# Rename Source\n\n[[Original Target]]' })
    noteIds.push(target.id, source.id)
    expect(db.getBacklinks(target.id)).toHaveLength(1)

    db.updateNote(target.id, { content: '# Renamed Target' })

    expect(db.getBacklinks(target.id)).toEqual([])
    expect(db.getAllLinks().find((link) => link.sourceNoteId === source.id)?.targetNoteId).toBeNull()
  })
})
