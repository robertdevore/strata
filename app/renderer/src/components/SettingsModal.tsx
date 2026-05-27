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

const CHEAP_PROVIDERS = [
	{ value: 'deepseek-flash', label: 'DeepSeek V4 Flash' },
	{ value: 'kimi', label: 'Kimi / Moonshot' },
	{ value: 'openrouter', label: 'OpenRouter' },
	{ value: 'custom', label: 'Custom OpenAI-compatible' },
]

const PREMIUM_PROVIDERS = [
	{ value: 'openai', label: 'OpenAI (Responses API)' },
	{ value: 'openrouter', label: 'OpenRouter' },
	{ value: 'custom', label: 'Custom OpenAI-compatible' },
]

export function SettingsModal({ open, settings, onClose, onUpdate, onCreateBackup, onOpenBackupsFolder }: SettingsModalProps) {
	const [backup_status, set_backup_status] = useState('')
	const [is_creating_backup, set_is_creating_backup] = useState(false)
	const [is_opening_backup_folder, set_is_opening_backup_folder] = useState(false)
	const [show_advanced, set_show_advanced] = useState(false)

	const format_backup_time = (value: string | null): string => {
		if (!value) return 'Never'
		const parsed = new Date(value)
		if (Number.isNaN(parsed.getTime())) return value
		return parsed.toLocaleString()
	}

	if (!open) return null

	const ai_routing_mode = settings.aiRoutingMode || 'auto'
	const ai_cheap_provider = settings.aiCheapProvider || 'deepseek-flash'
	const ai_premium_provider = settings.aiPremiumProvider || 'openai'

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-card" onClick={(event) => event.stopPropagation()}>
				<button className="icon-button modal-close-button" onClick={onClose} aria-label="Close settings" title="Close settings">
					<CloseIcon />
				</button>
				<h3>Settings</h3>

				{/* ---- General ---- */}
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

				<hr />

				{/* ---- AI Routing ---- */}
				<h4>AI Provider</h4>

				<label>
					AI Mode
					<select value={ai_routing_mode} onChange={(event) => onUpdate({ aiRoutingMode: event.target.value as Settings['aiRoutingMode'] })}>
						<option value="premium_only">Premium only</option>
						<option value="cheap_only">Cheap only</option>
						<option value="auto">Auto (routing)</option>
						<option value="ask_each_time">Ask each time</option>
					</select>
				</label>

				<label>
					Cheap Provider
					<select value={ai_cheap_provider} onChange={(event) => onUpdate({ aiCheapProvider: event.target.value })}>
						{CHEAP_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
					</select>
				</label>

				<label>
					Cheap Model
					<input
						type="text"
						className="search-input"
						value={settings.aiCheapModel || ''}
						onChange={(event) => onUpdate({ aiCheapModel: event.target.value })}
						placeholder="e.g. deepseek-v4-flash"
						spellCheck={false}
					/>
				</label>

				<label>
					Premium Provider
					<select value={ai_premium_provider} onChange={(event) => onUpdate({ aiPremiumProvider: event.target.value })}>
						{PREMIUM_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
					</select>
				</label>

				<label>
					Premium Model
					<input
						type="text"
						className="search-input"
						value={settings.aiPremiumModel || ''}
						onChange={(event) => onUpdate({ aiPremiumModel: event.target.value })}
						placeholder="e.g. gpt-4o"
						spellCheck={false}
					/>
				</label>

				<hr />

				{/* ---- API Keys ---- */}
				<h4>API Keys</h4>

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
					DeepSeek API Key
					<input
						type="password"
						className="search-input"
						value={settings.aiDeepseekApiKey || ''}
						onChange={(event) => onUpdate({ aiDeepseekApiKey: event.target.value })}
						placeholder="sk-..."
						autoComplete="off"
						spellCheck={false}
					/>
				</label>

				<label>
					Kimi / Moonshot API Key
					<input
						type="password"
						className="search-input"
						value={settings.aiKimiApiKey || ''}
						onChange={(event) => onUpdate({ aiKimiApiKey: event.target.value })}
						placeholder="sk-..."
						autoComplete="off"
						spellCheck={false}
					/>
				</label>

				<label>
					OpenRouter API Key
					<input
						type="password"
						className="search-input"
						value={settings.aiOpenrouterApiKey || ''}
						onChange={(event) => onUpdate({ aiOpenrouterApiKey: event.target.value })}
						placeholder="sk-or-..."
						autoComplete="off"
						spellCheck={false}
					/>
				</label>

				<label>
					Custom Provider API Key
					<input
						type="password"
						className="search-input"
						value={settings.aiCustomApiKey || ''}
						onChange={(event) => onUpdate({ aiCustomApiKey: event.target.value })}
						placeholder="sk-..."
						autoComplete="off"
						spellCheck={false}
					/>
				</label>

				<hr />

				{/* ---- AI Edit Mode ---- */}
				<label>
					AI Edit Mode
					<select value={settings.aiEditMode ?? 'confirm'} onChange={(event) => onUpdate({ aiEditMode: event.target.value as Settings['aiEditMode'] })}>
						<option value="read_only">Read Only — AI cannot edit notes</option>
						<option value="confirm">Confirm — changes saved, revert available</option>
						<option value="auto_apply">Auto Apply — AI edits freely (history kept)</option>
					</select>
				</label>

				<hr />

				{/* ---- Advanced ---- */}
				<button className="ghost-button" style={{ width: '100%', marginBottom: 12 }} onClick={() => set_show_advanced((v) => !v)}>
					{show_advanced ? '\u25BE' : '\u25B8'} Advanced
				</button>

				{show_advanced && (
					<>
						<label>
							Custom Provider Base URL
							<input
								type="text"
								className="search-input"
								value={settings.aiCustomBaseUrl || ''}
								onChange={(event) => onUpdate({ aiCustomBaseUrl: event.target.value })}
								placeholder="https://api.example.com/v1"
								spellCheck={false}
							/>
						</label>

						<label className="inline-toggle">
							<input
								type="checkbox"
								checked={settings.aiShowRoutingDecisions !== false}
								onChange={(event) => onUpdate({ aiShowRoutingDecisions: event.target.checked })}
							/>
							Show routing decisions in chat
						</label>

						<label className="inline-toggle">
							<input
								type="checkbox"
								checked={settings.aiEnableRouteLogs !== false}
								onChange={(event) => onUpdate({ aiEnableRouteLogs: event.target.checked })}
							/>
							Enable route logs
						</label>

						<label>
							Cheap Confidence Threshold ({settings.aiCheapConfidenceThreshold ?? 0.85})
							<input
								type="range"
								min="0.5"
								max="1.0"
								step="0.01"
								value={settings.aiCheapConfidenceThreshold ?? 0.85}
								onChange={(event) => onUpdate({ aiCheapConfidenceThreshold: parseFloat(event.target.value) })}
							/>
						</label>

						<label>
							Premium Fallback Threshold ({settings.aiPremiumFallbackThreshold ?? 0.65})
							<input
								type="range"
								min="0.3"
								max="0.9"
								step="0.01"
								value={settings.aiPremiumFallbackThreshold ?? 0.65}
								onChange={(event) => onUpdate({ aiPremiumFallbackThreshold: parseFloat(event.target.value) })}
							/>
						</label>
					</>
				)}

				<hr />

				{/* ---- Backups ---- */}
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
			</div>
		</div>
	)
}
