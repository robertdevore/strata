import { dialog, ipcMain } from 'electron'
import { z } from 'zod'
import { promises as fs } from 'node:fs'
import { exec } from 'node:child_process'
import path from 'node:path'
import { IPC_CHANNELS } from '../../shared/ipc'

const publish_schema = z.object({
	destination: z.string().min(1),
	title: z.string().min(1),
	html: z.string().min(1),
})

const shell_run_schema = z.object({
	command: z.string().min(1),
	cwd: z.string().optional(),
})

export const registerPublishHandlers = () => {
	ipcMain.handle(IPC_CHANNELS.dialogSelectFolder, async () => {
		const result = await dialog.showOpenDialog({
			properties: ['openDirectory', 'createDirectory'],
			title: 'Select publish destination',
		})
		if (result.canceled || !result.filePaths.length) return null
		return result.filePaths[0]
	})

	ipcMain.handle(IPC_CHANNELS.publishHtmlFile, async (_event, payload) => {
		const { destination, title, html } = publish_schema.parse(payload)
		const safe_name = title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'untitled-note'
		const file_path = path.join(destination, `${safe_name}.html`)

		try {
			await fs.writeFile(file_path, html, 'utf-8')
			return { success: true, path: file_path }
		} catch (err) {
			return { success: false, error: err instanceof Error ? err.message : String(err) }
		}
	})

	ipcMain.handle(IPC_CHANNELS.shellRun, async (_event, payload) => {
		const { command, cwd } = shell_run_schema.parse(payload)
		return new Promise<{ success: boolean; stdout: string; stderr: string }>((resolve) => {
			exec(command, { cwd: cwd || undefined, timeout: 30000 }, (error, stdout, stderr) => {
				if (error) {
					resolve({ success: false, stdout: stdout || '', stderr: stderr || error.message })
				} else {
					resolve({ success: true, stdout: stdout || '', stderr: stderr || '' })
				}
			})
		})
	})
}
