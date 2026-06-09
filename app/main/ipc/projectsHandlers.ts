import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { StrataDatabase } from '../db/index'
import { IPC_CHANNELS } from '../../shared/ipc'

const project_create_schema = z.object({
	name: z.string().trim().min(1).max(120),
})

const project_update_schema = z.object({
	id: z.string().uuid(),
	name: z.string().trim().min(1).max(120),
})

const project_delete_schema = z.object({
	id: z.string().uuid(),
})

const project_reorder_schema = z.object({
	projectIds: z.array(z.string().uuid()).min(1),
})

const import_schema = z.object({
	projectName: z.string().trim().min(1).max(120),
	filePaths: z.array(z.string().min(1)).min(1),
})

const derive_title_from_markdown = (content: string, fallback_name: string): string => {
	const trimmed_lines = content.split(/\r?\n/).map((line) => line.trim())
	for (const line of trimmed_lines) {
		if (!line) continue
		if (line.startsWith('# ')) {
			return line.slice(2).trim() || fallback_name
		}
		return line.replace(/^#+\s*/, '').trim() || fallback_name
	}
	return fallback_name
}

const normalize_markdown_content = (content: string, fallback_name: string): string => {
	const trimmed = content.trim()
	if (!trimmed) {
		return `# ${fallback_name}\n\n`
	}
	const first_non_empty = trimmed.split(/\r?\n/).find((line) => line.trim().length > 0) ?? ''
	if (first_non_empty.startsWith('# ')) return content
	const title = derive_title_from_markdown(content, fallback_name)
	return `# ${title}\n\n${content}`
}

const import_markdown_files = async (db: StrataDatabase, project_name: string, file_paths: string[]) => {
	const project = db.createProject(project_name)
	const imported_notes = []

	for (const file_path of file_paths) {
		const raw = await fs.readFile(file_path, 'utf-8')
		const fallback_name = path.basename(file_path, path.extname(file_path))
		const content = normalize_markdown_content(raw, fallback_name)
		const note = db.createNote({
			content,
			projectId: project.id,
		})
		imported_notes.push(note)
	}

	return { project, notes: imported_notes }
}

export const registerProjectsHandlers = (db: StrataDatabase, on_notes_changed?: () => void) => {
	ipcMain.handle(IPC_CHANNELS.projectsList, () => db.listProjects())

	ipcMain.handle(IPC_CHANNELS.projectsCreate, (_event, payload) => {
		const { name } = project_create_schema.parse(payload)
		const project = db.createProject(name)
		on_notes_changed?.()
		return project
	})

	ipcMain.handle(IPC_CHANNELS.projectsUpdate, (_event, payload) => {
		const { id, name } = project_update_schema.parse(payload)
		const project = db.renameProject(id, name)
		if (project) on_notes_changed?.()
		return project
	})

	ipcMain.handle(IPC_CHANNELS.projectsDelete, (_event, payload) => {
		const { id } = project_delete_schema.parse(payload)
		const deleted = db.deleteProject(id)
		if (deleted) on_notes_changed?.()
		return deleted
	})

	ipcMain.handle(IPC_CHANNELS.projectsImportFolder, async (_event, payload) => {
		const { projectName, filePaths } = import_schema.parse(payload)
		const result = await import_markdown_files(db, projectName, filePaths)
		on_notes_changed?.()
		return {
			project: result.project,
			notes: result.notes,
			count: result.notes.length,
		}
	})

	ipcMain.handle(IPC_CHANNELS.projectsReorder, (_event, payload) => {
		const { projectIds } = project_reorder_schema.parse(payload)
		const projects = db.reorderProjects(projectIds)
		on_notes_changed?.()
		return projects
	})
}
