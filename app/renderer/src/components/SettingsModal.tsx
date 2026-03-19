import { useState } from 'react'
import type { Settings } from '@shared/types'
import { CloseIcon } from './icons'

interface SettingsModalProps {
	open: boolean
	settings: Settings
	onClose: () => void
	onUpdate: (patch: Partial<Settings>) => void
	onCreateBackup: () => Promise<{ directory: string; createdAt: string }>
	onOpenBackupsFolder: () => Promise<void>
}

const openai_model_options = [
	{ value: 'gpt-5.4', label: 'GPT-5.4' },
	{ value: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
	{ value: 'gpt-5.4-nano', label: 'GPT-5.4 nano' },
	{ value: 'gpt-5.2', label: 'GPT-5.2' },
	{ value: 'gpt-5.1', label: 'GPT-5.1' },
	{ value: 'gpt-4o', label: 'GPT-4o' },
	{ value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
	{ value: 'gpt-5-codex', label: 'GPT-5 Codex' },
	{ value: 'gpt-5.1-codex', label: 'GPT-5.1 Codex' },
] as const

export function SettingsModal({ open, settings, onClose, onUpdate, onCreateBackup, onOpenBackupsFolder }: SettingsModalProps) {
	const [backup_status, set_backup_status] = useState('')
	const [is_creating_backup, set_is_creating_backup] = useState(false)
	const [is_opening_backup_folder, set_is_opening_backup_folder] = useState(false)

	const format_backup_time = (value: string | null): string => {
		if (!value) return 'Never'
		const parsed = new Date(value)
		if (Number.isNaN(parsed.getTime())) return value
		return parsed.toLocaleString()
	}

	if (!open) return null
	const selected_openai_model = openai_model_options.some((option) => option.value === settings.openAiModel)
		? settings.openAiModel
		: 'gpt-4o'
	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-card" onClick={(event) => event.stopPropagation()}>
				<button className="icon-button modal-close-button" onClick={onClose} aria-label="Close settings" title="Close settings">
					<CloseIcon />
				</button>
				<h3>Settings</h3>
				<label>
					Theme
					<select value={settings.theme} onChange={(event) => onUpdate({ theme: event.target.value as Settings['theme'] })}>
						<option value="dark">Dark</option>
						<option value="light">Light</option>
						<option value="system">System</option>
					</select>
				</label>
				<label>
					Default View
					<select value={settings.defaultView} onChange={(event) => onUpdate({ defaultView: event.target.value as Settings['defaultView'] })}>
						<option value="all">All</option>
						<option value="starred">Starred</option>
					</select>
				</label>
				<label>
					Sort Mode
					<select value={settings.sortMode} onChange={(event) => onUpdate({ sortMode: event.target.value as Settings['sortMode'] })}>
						<option value="updated_desc">Last edited</option>
						<option value="created_desc">Created date</option>
						<option value="title_asc">Title</option>
					</select>
				</label>
				<label className="inline-toggle">
					<input type="checkbox" checked={settings.confirmDelete} onChange={(event) => onUpdate({ confirmDelete: event.target.checked })} />
					Confirm before delete
				</label>
				<label>
					OpenAI API Key
					<input
						type="password"
						className="search-input"
						value={settings.openAiApiKey}
						onChange={(event) => onUpdate({ openAiApiKey: event.target.value })}
						placeholder="sk-..."
						autoComplete="off"
						spellCheck={false}
					/>
				</label>
				<label>
					OpenAI Chat Model
					<select
						value={selected_openai_model}
						onChange={(event) => onUpdate({ openAiModel: event.target.value })}
					>
						{openai_model_options.map((option) => (
							<option key={option.value} value={option.value}>{option.label}</option>
						))}
					</select>
				</label>
				<label>
					Auto Backup Frequency
					<select value={settings.autoBackupFrequency} onChange={(event) => onUpdate({ autoBackupFrequency: event.target.value as Settings['autoBackupFrequency'] })}>
						<option value="off">Off</option>
						<option value="12h">Every 12 hours</option>
						<option value="24h">Every day</option>
						<option value="168h">Every week</option>
					</select>
				</label>
				<p className="tags-label">Last auto backup: {format_backup_time(settings.lastAutoBackupAt)}</p>
				<div className="modal-actions backup-actions">
					<button className="ghost-button" disabled={is_creating_backup} onClick={() => {
						set_is_creating_backup(true)
						set_backup_status('')
						void onCreateBackup()
							.then((result) => set_backup_status(`Backup created: ${result.directory}`))
							.catch((error) => set_backup_status(error instanceof Error ? error.message : 'Backup failed'))
							.finally(() => set_is_creating_backup(false))
					}}>Create backup now</button>
					<button className="ghost-button" disabled={is_opening_backup_folder} onClick={() => {
						set_is_opening_backup_folder(true)
						void onOpenBackupsFolder()
							.catch((error) => set_backup_status(error instanceof Error ? error.message : 'Could not open backups folder'))
							.finally(() => set_is_opening_backup_folder(false))
					}}>Open backups folder</button>
				</div>
				{backup_status && <p className="tags-label">{backup_status}</p>}
				<div className="coming-soon">Integrations (Coming Soon)</div>
			</div>
		</div>
	)
}
