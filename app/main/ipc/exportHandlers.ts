import { BrowserWindow, ipcMain } from 'electron'
import { z } from 'zod'
import { IPC_CHANNELS } from '../../shared/ipc'

const export_pdf_schema = z.object({
	html: z.string().min(1),
})

const print_html_schema = z.object({
	html: z.string().min(1),
})

export const registerExportHandlers = () => {
	ipcMain.handle(IPC_CHANNELS.exportPdf, async (_event, payload) => {
		const { html } = export_pdf_schema.parse(payload)

		const export_window = new BrowserWindow({
			show: false,
			width: 900,
			height: 1200,
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
			},
		})

		try {
			await export_window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

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

	ipcMain.handle(IPC_CHANNELS.printHtml, async (event, payload) => {
		const { html } = print_html_schema.parse(payload)

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
			},
		})

		try {
			await print_window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

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
					}
				)
			})

			return print_result
		} finally {
			if (!print_window.isDestroyed()) print_window.destroy()
		}
	})
}
