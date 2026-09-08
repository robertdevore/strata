import { handleTrustedIpc } from '../security/trustedIpc'
import { protectNavigation } from '../security/navigation'
import { exportDocumentSchema, exportDocumentUrl } from '../security/exportDocument'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc'

export const registerExportHandlers = () => {
  handleTrustedIpc(IPC_CHANNELS.exportPdf, async (_event, payload) => {
    const { html } = exportDocumentSchema.parse(payload)

    const export_window = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        javascript: false,
      },
    })

    protectNavigation(export_window.webContents)
    try {
      await export_window.loadURL(exportDocumentUrl(html))

      const pdf_data = await export_window.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        pageSize: 'A4',
        margins: {
          top: 0.4,
          bottom: 0.4,
          left: 0.4,
          right: 0.4,
        },
      })

      return Uint8Array.from(pdf_data)
    } finally {
      if (!export_window.isDestroyed()) export_window.destroy()
    }
  })

  handleTrustedIpc(IPC_CHANNELS.printHtml, async (event, payload) => {
    const { html } = exportDocumentSchema.parse(payload)

    const parent_window = BrowserWindow.fromWebContents(event.sender)
    const print_window = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      parent: parent_window ?? undefined,
      modal: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        javascript: false,
      },
    })

    protectNavigation(print_window.webContents)
    try {
      await print_window.loadURL(exportDocumentUrl(html))

      const print_result = await new Promise<boolean>((resolve, reject) => {
        print_window.webContents.print(
          {
            silent: false,
            printBackground: true,
          },
          (success, failure_reason) => {
            if (success) {
              resolve(true)
              return
            }

            reject(new Error(failure_reason || 'Print failed'))
          },
        )
      })

      return print_result
    } finally {
      if (!print_window.isDestroyed()) print_window.destroy()
    }
  })
}
