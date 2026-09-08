import fs from 'node:fs'
import path from 'node:path'
import { expect, it, vi } from 'vitest'

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>())
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => handlers.set(channel, listener),
  },
}))
import { configureTrustedIpc, handleTrustedIpc } from '../../../main/security/trustedIpc'

it('fails closed before configuration and rejects foreign windows, frames and documents before dispatch', () => {
  const url = 'file:///application/index.html'
  const frame = { url }
  const contents = { mainFrame: frame } as Electron.WebContents
  const event = { sender: contents, senderFrame: frame }
  const listener = vi.fn((_event, value) => value)
  handleTrustedIpc('test:boundary', listener)
  const invoke = handlers.get('test:boundary')!
  expect(() => invoke(event, 'private')).toThrow('UNTRUSTED_IPC_SENDER')
  configureTrustedIpc(() => contents, url)
  for (const invalid of [
    { sender: { mainFrame: frame }, senderFrame: frame },
    { sender: contents, senderFrame: { url } },
    { sender: contents, senderFrame: null },
  ]) {
    expect(() => invoke(invalid, 'private')).toThrow('UNTRUSTED_IPC_SENDER')
  }
  for (const otherUrl of ['file:///application/other.html', 'https://example.com', '', url + '?other=1']) {
    frame.url = otherUrl
    expect(() => invoke(event, 'private')).toThrow('UNTRUSTED_IPC_SENDER')
  }
  expect(listener).not.toHaveBeenCalled()
  frame.url = url + '#note'
  expect(invoke(event, 'expected')).toBe('expected')
  expect(listener).toHaveBeenCalledExactlyOnceWith(event, 'expected')
  configureTrustedIpc(() => null, url)
  expect(() => invoke(event, 'private')).toThrow('UNTRUSTED_IPC_SENDER')
})

it('keeps every handler registration behind the sender boundary', () => {
  const directory = path.resolve('app/main/ipc')
  const sources = fs.readdirSync(directory).filter((name) => name.endsWith('.ts'))
  expect(sources.length).toBeGreaterThan(0)
  for (const name of sources) {
    const source = fs.readFileSync(path.join(directory, name), 'utf8')
    expect(source, name).not.toMatch(/\bipcMain\b/)
    expect(source, name).toContain('handleTrustedIpc(')
  }
})
