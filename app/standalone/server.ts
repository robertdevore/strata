import os from 'node:os'
import path from 'node:path'
import { StrataDatabase } from '../main/db/index'
import { startNotesApiServer } from '../main/api/notesApiServer'

const default_user_data_dir = (): string => {
	if ('darwin' === process.platform) {
		return path.join(os.homedir(), 'Library', 'Application Support', 'strata')
	}
	if ('win32' === process.platform) {
		return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'strata')
	}
	return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'strata')
}

const run = async (): Promise<void> => {
	const user_data_dir = (process.env.STRATA_USER_DATA_DIR || default_user_data_dir()).trim()
	const db = new StrataDatabase(user_data_dir)

	const shutdown = async (server: { close: () => Promise<void> }) => {
		process.off('SIGINT', on_sigint)
		process.off('SIGTERM', on_sigterm)
		await server.close()
		db.close()
	}

	let active_server: { close: () => Promise<void> } | null = null

	const on_sigint = () => {
		if (!active_server) process.exit(0)
		void shutdown(active_server).finally(() => process.exit(0))
	}

	const on_sigterm = () => {
		if (!active_server) process.exit(0)
		void shutdown(active_server).finally(() => process.exit(0))
	}

	process.on('SIGINT', on_sigint)
	process.on('SIGTERM', on_sigterm)

	active_server = await startNotesApiServer(db)
	console.info(`[strata-server] Using data from ${user_data_dir}`)

	await new Promise<void>(() => {
		// Keep the process alive until interrupted.
	})
}

void run().catch((error) => {
	console.error('[strata-server] Failed to start', error)
	process.exit(1)
})
