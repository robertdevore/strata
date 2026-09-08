import { useEffect, useState } from 'react'

export const HistoryStorage = () => {
  const [stats, setStats] = useState<{ revisions: number; bytes: number } | null>(null)
  const [keep, setKeep] = useState(100)
  const [plan, setPlan] = useState<{ count: number; bytes: number; fingerprint: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  useEffect(() => {
    void window.strata.history
      .storage()
      .then(setStats)
      .catch(() => setStatus('Could not read history storage'))
  }, [])
  const preview = async () => {
    setBusy(true)
    setPlan(null)
    try {
      setPlan(await window.strata.history.previewPrune(keep))
      setStatus('')
    } catch {
      setStatus('Could not preview cleanup')
    } finally {
      setBusy(false)
    }
  }
  const apply = async () => {
    if (!plan) return
    setBusy(true)
    try {
      const count = await window.strata.history.prune(keep, plan.fingerprint)
      setStatus(`Removed ${count} old revisions`)
      setPlan(null)
      setStats(await window.strata.history.storage())
    } catch {
      setPlan(null)
      setStatus('Cleanup could not be applied. Preview again; history may have changed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section>
      <h3>Note history storage</h3>
      {stats && (
        <p>
          {stats.revisions} revisions · {(stats.bytes / 1048576).toFixed(2)} MiB of snapshot data
        </p>
      )}
      <p>
        History is kept until you clean it up. Cleanup preserves the newest revisions of every note, including
        deleted notes. Create a backup first if you want to retain older recovery points.
      </p>
      <label>
        Revisions to keep per note
        <select
          disabled={busy}
          value={keep}
          onChange={(event) => {
            setKeep(Number(event.target.value))
            setPlan(null)
          }}
        >
          {[20, 50, 100, 500, 1000].map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </label>
      <button disabled={busy} onClick={() => void preview()}>
        Preview history cleanup
      </button>
      {plan && (
        <div>
          <p>
            {plan.count} older revisions ({(plan.bytes / 1048576).toFixed(2)} MiB) will be permanently removed
            from this library. Current notes and existing backups are preserved. SQLite may reuse freed space
            without shrinking the file.
          </p>
          <button disabled={busy || plan.count === 0} onClick={() => void apply()}>
            Permanently remove {plan.count} old revisions
          </button>
          <button disabled={busy} onClick={() => setPlan(null)}>
            Cancel
          </button>
        </div>
      )}
      {status && <p role="status">{status}</p>}
    </section>
  )
}
