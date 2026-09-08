import { dialog, ipcMain } from 'electron'
import { z } from 'zod'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { IPC_CHANNELS } from '../../shared/ipc'

const publish_schema = z.object({
	destination: z.string().min(1),
	title: z.string().min(1),
	html: z.string().min(1),
})

export const registerPublishHandlers = () => {
	const destinations = new Set<string>()
	ipcMain.handle(IPC_CHANNELS.dialogSelectFolder, async () => {
		const result = await dialog.showOpenDialog({
			properties: ['openDirectory', 'createDirectory'],
			title: 'Select publish destination',
		})
		if (result.canceled || !result.filePaths.length) return null
		destinations.add(await fs.realpath(result.filePaths[0]))
		return result.filePaths[0]
	})

	ipcMain.handle(IPC_CHANNELS.publishHtmlFile, async (_event, payload) => {
		const { destination, title, html } = publish_schema.parse(payload)
		if (!destinations.has(await fs.realpath(destination))) throw new Error('Select the publish destination first')
		const safe_name = title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'untitled-note'
		const file_path = path.join(destination, `${safe_name}.html`)

		try {
			await fs.writeFile(file_path, html, { encoding: 'utf-8', flag: 'wx' })
			return { success: true, path: file_path }
		} catch (err) {
			return { success: false, error: err instanceof Error ? err.message : String(err) }
		}
	})

}
