// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
vi.mock('../components/AiProposals', () => ({ AiProposals: () => null }))
import { ChatPanel } from '../components/ChatPanel'
afterEach(cleanup)
const fixture = (): ComponentProps<typeof ChatPanel> => ({
  threads: [],
  activeThreadId: 'first',
  messages: [],
  modelName: 'fixture',
  threadModel: 'openai::fixture',
  modelCatalog: [{ providerId: 'openai', providerLabel: 'OpenAI', model: 'fixture' }],
  askEachTime: true,
  noteTitlesById: {},
  noteLinkOptions: [],
  searchQuery: '',
  searchResults: [],
  loadingThreads: false,
  loadingMessages: false,
  sending: false,
  cancelling: false,
  onStop: vi.fn(),
  assistantTyping: false,
  deleting: false,
  errorMessage: '',
  chatUsageSummary: null,
  chatUsageLoading: false,
  onSelectThread: vi.fn(),
  onCreateThread: vi.fn(),
  onDeleteThread: vi.fn().mockResolvedValue(undefined),
  onRenameThread: vi.fn().mockResolvedValue(undefined),
  onSearchQueryChange: vi.fn(),
  onRunSearch: vi.fn(),
  onClearSearch: vi.fn(),
  onSendMessage: vi.fn().mockResolvedValue(undefined),
  onOpenNote: vi.fn(),
  onSetThreadModel: vi.fn(),
})
it('requires a new explicit choice for every message and protects keyboard submission', () => {
  const props = fixture()
  const view = render(<ChatPanel {...props} />)
  expect(screen.queryByRole('button', { name: 'Select AI model' })).toBeNull()
  const input = screen.getByPlaceholderText('Message Strata AI…')
  const send = screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement
  fireEvent.change(input, { target: { value: 'first message' } })
  expect(send.disabled).toBe(true)
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(props.onSendMessage).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Model for this message'), { target: { value: 'openai::fixture' } })
  expect(send.disabled).toBe(false)
  fireEvent.click(send)
  expect(props.onSendMessage).toHaveBeenCalledWith('first message', 'openai::fixture')
  expect(props.onSetThreadModel).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: 'second message' } })
  expect(send.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Model for this message'), { target: { value: 'openai::fixture' } })
  view.rerender(<ChatPanel {...props} modelCatalog={[]} />)
  expect(send.disabled).toBe(true)
  view.rerender(<ChatPanel {...props} activeThreadId="second" />)
  expect(send.disabled).toBe(true)
})
it('keeps ordinary Auto submission available without a per-message override', () => {
  const props = { ...fixture(), askEachTime: false }
  render(<ChatPanel {...props} />)
  expect(screen.queryByLabelText('Model for this message')).toBeNull()
  const input = screen.getByPlaceholderText('Message Strata AI…')
  fireEvent.change(input, { target: { value: 'normal message' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(props.onSendMessage).toHaveBeenCalledWith('normal message', undefined)
})
