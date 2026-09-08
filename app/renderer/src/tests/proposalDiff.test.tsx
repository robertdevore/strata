// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ProposalDiff } from '../components/ProposalDiff'
import { textChange } from '../components/proposalTextDiff'
afterEach(cleanup)
it('shows exact added and removed lines with explicit shared boundaries', () => {
  expect(textChange('# Title\nold\nend', '# Title\nnew\nend')).toBe(
    '… 1 unchanged leading lines\n− old\n+ new\n… 1 unchanged trailing lines',
  )
  expect(textChange('same', 'same')).toBe('Text unchanged.')
  expect(textChange('', 'new\n')).toBe('+ new\n+ ')
  expect(textChange('old', '')).toBe('− old')
  const before = 'shared\n'.repeat(50000) + 'old'
  const after = 'shared\n'.repeat(50000) + 'new'
  expect(textChange(before, after)).toBe('… 50000 unchanged leading lines\n− old\n+ new')
})
it('renders untrusted text literally and preserves full snapshots with metadata changes', () => {
  const malicious = '<img src=x onerror=alert(1)>'
  const { container } = render(
    <ProposalDiff
      before={{ content: 'old', starred: false, tags: ['one'] }}
      after={{ content: malicious, starred: true, tags: ['two'] }}
    />,
  )
  expect(screen.getByText(`− old\n+ ${malicious}`, { normalizer: (value) => value })).toBeTruthy()
  expect(container.querySelector('img')).toBeNull()
  expect(screen.getByText('Starred')).toBeTruthy()
  expect(screen.getByText('Yes')).toBeTruthy()
  expect(screen.getByText('No')).toBeTruthy()
  expect(screen.getByText('Complete before and after states')).toBeTruthy()
  expect(container.querySelector('details')?.textContent).toContain('"tags"')
})
