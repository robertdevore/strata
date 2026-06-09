import type { Note, Project } from '@shared/types'

export const projectsService = {
	list(): Promise<Project[]> {
		return window.strata.projects.list()
	},
	create(name: string): Promise<Project> {
		return window.strata.projects.create({ name })
	},
	update(id: string, name: string): Promise<Project | null> {
		return window.strata.projects.update(id, { name })
	},
	delete(id: string): Promise<boolean> {
		return window.strata.projects.delete(id)
	},
	importFolder(payload: { projectName: string; filePaths: string[] }): Promise<{ project: Project; notes: Note[]; count: number }> {
		return window.strata.projects.importFolder(payload)
	},
	reorder(projectIds: string[]): Promise<Project[]> {
		return window.strata.projects.reorder(projectIds)
	},
}
