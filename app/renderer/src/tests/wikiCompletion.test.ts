import { afterEach, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import type { CompletionContext } from '@codemirror/autocomplete'
import { completeWikiLinks } from '../domain/wikiCompletion'

afterEach(() => vi.unstubAllGlobals())
const context = (text: string) =>
  ({ state: EditorState.create({ doc: text }), pos: text.length, aborted: false }) as CompletionContext

it('uses bounded indexed summaries rather than a cached sidebar list', async () => {
  const page = vi
    .fn()
    .mockResolvedValue({ notes: [{ title: 'Distant topic' }, { title: 'Body match only' }] })
  vi.stubGlobal('window', { strata: { notes: { page } } })
  const result = await completeWikiLinks(context('See [[Distant'))
  expect(page).toHaveBeenCalledWith({ query: 'Distant', limit: 8 })
  expect(result).toMatchObject({ from: 4, options: [{ label: 'Distant topic', apply: '[[Distant topic]]' }] })
})

it('ignores aborted, closed, oversized or failed completion requests', async () => {
  const page = vi.fn().mockResolvedValue({ notes: [{ title: 'Distant topic' }] })
  vi.stubGlobal('window', { strata: { notes: { page } } })
  const aborted = context('[[Distant')
  Object.defineProperty(aborted, 'aborted', { value: true })
  expect(await completeWikiLinks(aborted)).toBeNull()
  page.mockClear()
  for (const text of ['Plain text', '[[Distant]]', '[[' + 'a'.repeat(201)])
    expect(await completeWikiLinks(context(text))).toBeNull()
  expect(page).not.toHaveBeenCalled()
  page.mockRejectedValue(new Error('Unavailable'))
  expect(await completeWikiLinks(context('[[Distant'))).toBeNull()
})
