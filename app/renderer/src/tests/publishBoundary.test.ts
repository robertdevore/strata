import { expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  select: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) =>
      mocks.handlers.set(channel, listener),
  },
  dialog: { showOpenDialog: mocks.select },
}))
import { registerPublishHandlers } from '../../../main/ipc/publishHandlers'
import { configureTrustedIpc } from '../../../main/security/trustedIpc'
import { IPC_CHANNELS } from '../../../shared/ipc'

it('uses the approved canonical directory even if its selected alias changes, and never overwrites', async () => {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'strata-publish-')))
  const approved = path.join(directory, 'approved')
  const other = path.join(directory, 'other')
  const alias = path.join(directory, 'selected-alias')
  try {
    await fs.mkdir(approved)
    await fs.mkdir(other)
    await fs.symlink(approved, alias, 'dir')
    const frame = { url: 'file:///test/index.html' }
    const sender = { mainFrame: frame } as Electron.WebContents
    const event = { sender, senderFrame: frame }
    configureTrustedIpc(() => sender, frame.url)
    registerPublishHandlers()
    mocks.select.mockResolvedValue({ canceled: false, filePaths: [alias] })
    await mocks.handlers.get(IPC_CHANNELS.dialogSelectFolder)!(event)
    const publish = async (payload: unknown) =>
      (await mocks.handlers.get(IPC_CHANNELS.publishHtmlFile)!(event, payload)) as {
        success: boolean
        path: string
      }
    const originalRealpath = fs.realpath.bind(fs)
    const lookup = vi.spyOn(fs, 'realpath').mockImplementationOnce(async (input) => {
      const resolved = await originalRealpath(input)
      await fs.unlink(alias)
      await fs.symlink(other, alias, 'dir')
      return resolved
    })
    const result = await publish({ destination: alias, title: 'Capture', html: '<h1>First</h1>' })
    lookup.mockRestore()
    expect(result.success).toBe(true)
    expect(result.path).toBe(path.join(approved, 'Capture.html'))
    expect(await fs.readFile(result.path, 'utf8')).toBe('<h1>First</h1>')
    expect(await fs.readdir(other)).toEqual([])
    const repeat = await publish({ destination: approved, title: 'Capture', html: '<h1>Second</h1>' })
    expect(repeat.success).toBe(false)
    expect(await fs.readFile(result.path, 'utf8')).toBe('<h1>First</h1>')
    await expect(publish({ destination: other, title: 'Outside', html: '<p>no</p>' })).rejects.toThrow(
      'Select the publish destination first',
    )
    await expect(
      publish({ destination: approved, title: 'Huge', html: 'x'.repeat(8 * 1024 * 1024 + 1) }),
    ).rejects.toThrow()
    const long = await publish({ destination: approved, title: '🌲'.repeat(100), html: '<p>Long title</p>' })
    expect(long.success).toBe(true)
    expect(Buffer.byteLength(path.basename(long.path), 'utf8')).toBeLessThanOrEqual(246)
    const reserved = await publish({ destination: approved, title: 'CON', html: '<p>Reserved</p>' })
    expect(path.basename(reserved.path)).toBe('_CON.html')
  } finally {
    vi.restoreAllMocks()
    await fs.rm(directory, { recursive: true, force: true })
  }
})
