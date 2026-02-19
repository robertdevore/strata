import type { Settings } from '@shared/types'
import { CloseIcon } from './icons'

interface SettingsModalProps {
	open: boolean
	settings: Settings
	onClose: () => void
	onUpdate: (patch: Partial<Settings>) => void
}

export function SettingsModal({ open, settings, onClose, onUpdate }: SettingsModalProps) {
	if (!open) return null
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
				<div className="coming-soon">Integrations (Coming Soon)</div>
			</div>
		</div>
	)
}
