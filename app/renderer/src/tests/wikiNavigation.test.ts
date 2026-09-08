import { afterEach, expect, it, vi } from 'vitest'
import { openWikiLink } from '../services/wikiNavigation'
afterEach(() => vi.unstubAllGlobals())
function setup(existing: unknown) {
  const links = {
    resolveTarget: vi
      .fn()
      .mockResolvedValue(existing ? { status: 'resolved', note: existing } : { status: 'missing' }),
    createMissingNote: vi.fn().mockResolvedValue({ id: 'created' }),
  }
  const confirm = vi.fn().mockReturnValue(true)
  vi.stubGlobal('window', { strata: { links }, confirm })
  return { links, confirm, open: vi.fn().mockResolvedValue(undefined) }
}
it('opens indexed targets outside the renderer cache without prompting or writing', async () => {
  const { links, confirm, open } = setup({ id: 'uncached' })
  expect(await openWikiLink('#strata-note:Existing%20note#Heading', true, open)).toBe(true)
  expect(links.resolveTarget).toHaveBeenCalledWith('Existing note')
  expect(open).toHaveBeenCalledWith('uncached', true)
  expect(confirm).not.toHaveBeenCalled()
  expect(links.createMissingNote).not.toHaveBeenCalled()
})
it('uses atomic create-if-missing only after approval', async () => {
  const { links, confirm, open } = setup(null)
  confirm.mockReturnValueOnce(false)
  await openWikiLink('strata-note://New', false, open)
  expect(links.createMissingNote).not.toHaveBeenCalled()
  await openWikiLink('strata-note://New', false, open)
  expect(links.createMissingNote).toHaveBeenCalledWith('New')
  expect(open).toHaveBeenCalledWith('created', false)
})
it('rejects malformed targets and propagates lookup errors without offering creation', async () => {
  const { links, confirm, open } = setup(null)
  await expect(openWikiLink('#strata-note:%ZZ', false, open)).rejects.toThrow()
  expect(links.resolveTarget).not.toHaveBeenCalled()
  links.resolveTarget.mockRejectedValueOnce(new Error('unavailable'))
  await expect(openWikiLink('#strata-note:Existing', false, open)).rejects.toThrow('unavailable')
  expect(confirm).not.toHaveBeenCalled()
  expect(await openWikiLink('https://example.com', false, open)).toBe(false)
})

it('requires an explicit choice for ambiguous titles without a creation prompt', async () => {
  const { links, confirm, open } = setup(null)
  links.resolveTarget.mockResolvedValue({ status: 'ambiguous', matches: [{ id: 'one' }, { id: 'two' }] })
  await expect(openWikiLink('#strata-note:Duplicate', false, open)).rejects.toThrow('Choose a note')
  expect(confirm).not.toHaveBeenCalled()
  expect(links.createMissingNote).not.toHaveBeenCalled()
  expect(open).not.toHaveBeenCalled()
})
