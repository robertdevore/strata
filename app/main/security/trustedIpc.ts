import { ipcMain } from 'electron'

let suspended = false
const active = new Map<Promise<void>, string>()

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
    if (suspended) throw new Error('LIBRARY_BUSY: A library restore is in progress.')
    const result = listener(event, ...args)
    if (result && typeof result.then === 'function') {
      const settled: Promise<void> = Promise.resolve(result).then(
        () => {},
        () => {},
      )
      active.set(settled, channel)
      void settled.then(() => active.delete(settled))
    }
    return result
  })
}

/** Freeze new privileged work and wait for already-dispatched operations to settle. */
export const suspendTrustedIpc = (excludedChannels: readonly string[]) => {
  if (suspended) throw new Error('LIBRARY_BUSY')
  suspended = true
  return {
    resume: () => {
      suspended = false
    },
    drain: async (timeoutMs = 10000): Promise<void> => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          Promise.all(
            [...active].filter(([, channel]) => !excludedChannels.includes(channel)).map(([work]) => work),
          ),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new Error('Active operations have not stopped. Retry restore when they finish.')),
              timeoutMs,
            )
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
