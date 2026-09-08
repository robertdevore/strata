import { ipcMain } from 'electron'

let isTrustedSender: (event: Electron.IpcMainInvokeEvent) => boolean = () => false

/** Configure before registration; a missing configuration always denies IPC. */
export const configureTrustedIpc = (
  getMainContents: () => Electron.WebContents | null,
  rendererUrl: string,
): void => {
  isTrustedSender = (event) => {
    const contents = getMainContents()
    if (!contents || event.sender !== contents || event.senderFrame !== contents.mainFrame) return false
    try {
      const requested = new URL(event.senderFrame.url)
      requested.hash = ''
      return requested.href === rendererUrl
    } catch {
      return false
    }
  }
}

/** All privileged handlers use this entry point, including read operations. */
export const handleTrustedIpc: typeof ipcMain.handle = (channel, listener) => {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('UNTRUSTED_IPC_SENDER')
    return listener(event, ...args)
  })
}
