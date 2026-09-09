import { Worker } from 'node:worker_threads'
import { SECRET_KEYS } from '../security/secretStore'

// Only a completed snapshot is passed here. Expensive VACUUM/quick_check work
// must not block the desktop main process while the user edits another note.
export const sanitizeBackup = (filename: string, databaseEntry: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(
      `const { parentPort, workerData } = require('node:worker_threads');
       let db;
       try {
         const Database = require(workerData.databaseEntry);
         db = new Database(workerData.filename, { fileMustExist: true });
         db.pragma('foreign_keys = ON');
         db.pragma('secure_delete = ON');
         const remove = db.prepare('DELETE FROM settings WHERE key = ?');
         for (const key of workerData.secretKeys) remove.run(key);
         db.exec('VACUUM');
         if (db.pragma('quick_check', { simple: true }) !== 'ok') throw new Error();
         db.close(); db = undefined;
         parentPort.postMessage({ ok: true });
       } catch {
         try { db?.close(); } catch {}
         parentPort.postMessage({ ok: false });
       }`,
      { eval: true, workerData: { filename, databaseEntry, secretKeys: SECRET_KEYS } },
    )
    let settled = false
    const settle = async (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      await worker.terminate()
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(() => void settle(new Error('Backup sanitization timed out')), 120000)
    worker.once('message', (result: { ok?: boolean }) => {
      void settle(result.ok ? undefined : new Error('Backup sanitization or integrity check failed'))
    })
    worker.once('error', () => void settle(new Error('Backup validation worker failed')))
    worker.once('exit', () => {
      if (!settled) void settle(new Error('Backup validation worker exited before completion'))
    })
  })
