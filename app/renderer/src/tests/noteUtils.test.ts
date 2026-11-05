import { describe, expect, it } from 'vitest'
import { deriveNoteTitle, normalizeTag } from '@renderer/src/domain/noteUtils'

describe('deriveNoteTitle', () => {
  it('uses first markdown heading when present', () => {
    expect(deriveNoteTitle('# My Title\n\nBody')).toBe('My Title')
  })

  it('falls back to first non-empty line', () => {
    expect(deriveNoteTitle('\n\nfirst line\nsecond')).toBe('first line')
  })

  it('returns Untitled when content is empty', () => {
    expect(deriveNoteTitle('   ')).toBe('Untitled')
  })

  it('recognizes any Markdown heading level without treating hashtags as headings', () => {
    expect(deriveNoteTitle('intro\n\n### Nested Title')).toBe('Nested Title')
    expect(deriveNoteTitle('#hashtag\n\nbody')).toBe('#hashtag')
  })
})

it.each([
  ['\r\n  intro  \r\n\t## Heading \r\n# Later', 'Heading'],
  ['####### Not a heading\n#hashtag', '####### Not a heading'],
  ['#   \nordinary', '#'],
  ['\t\r\n', 'Untitled'],
  ['x'.repeat(100) + '\nbody', 'x'.repeat(80)],
  ['intro\n###### ' + 'x'.repeat(100), 'x'.repeat(100)],
  ['# Early\n' + 'body\n'.repeat(150000), 'Early'],
  ['body\n'.repeat(150000) + '# Late', 'Late'],
])('preserves title extraction for whitespace, long lines and large bodies', (content, expected) => {
  expect(deriveNoteTitle(content)).toBe(expected)
})

describe('normalizeTag', () => {
  it('normalizes case and spaces', () => {
    expect(normalizeTag('  Product Ideas  ')).toBe('product-ideas')
  })

  it('keeps punctuation while normalizing spaces and case', () => {
    expect(normalizeTag('A/B+C')).toBe('a/b+c')
  })
})
