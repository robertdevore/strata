import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'

const exec = promisify(execFile)
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'strata-installed-'))
const npm = process.env.npm_execpath
if (!npm) throw new Error('Run through npm run package:verify')
let server
let serverOutput = ''
try {
  const pack = await exec(process.execPath, [npm, 'pack', '--json', '--pack-destination', temporary], {
    maxBuffer: 4 * 1024 * 1024,
  })
  const tarball = path.join(temporary, JSON.parse(pack.stdout)[0].filename)
  const install = path.join(temporary, 'installed')
  await fs.mkdir(install)
  await fs.writeFile(path.join(install, 'package.json'), '{"private":true}')
  await exec(
    process.execPath,
    [npm, 'install', '--prefix', install, '--omit=dev', '--no-audit', '--no-fund', tarball],
    { timeout: 240000, maxBuffer: 4 * 1024 * 1024 },
  )
  const launcher = path.join(install, 'node_modules', 'strata', 'scripts', 'strata.mjs')
  if (process.platform !== 'win32') {
    assert.equal(
      await fs.realpath(path.join(install, 'node_modules', '.bin', 'strata')),
      await fs.realpath(launcher),
    )
    assert((await fs.stat(launcher)).mode & 0o111, 'Installed CLI must be executable')
  }
  const reserve = net.createServer()
  await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve))
  const port = reserve.address().port
  await new Promise((resolve) => reserve.close(resolve))
  const base = `http://127.0.0.1:${port}`
  const env = {
    ...process.env,
    STRATA_API_TOKEN: randomBytes(32).toString('hex'),
    STRATA_API_CREDENTIAL_FILE: path.join(temporary, 'api-token'),
  }
  const args = [launcher, '--json', '--base-url', base]
  server = spawn(process.execPath, [...args, 'server', '--user-data-dir', path.join(temporary, 'library')], {
    cwd: temporary,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const output of [server.stdout, server.stderr])
    output.on('data', (chunk) => {
      serverOutput = (serverOutput + chunk.toString()).slice(-16000)
    })
  const deadline = Date.now() + 20000
  let ready = false
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Installed server exited: ${serverOutput}`)
    try {
      const response = await fetch(`${base}/health`, {
        headers: { 'X-Strata-Token': env.STRATA_API_TOKEN },
        signal: AbortSignal.timeout(500),
      })
      if (response.ok) {
        ready = true
        break
      }
    } catch {
      /* Wait for server startup. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert(ready, `Installed server did not become ready: ${serverOutput}`)
  const run = async (more) =>
    JSON.parse(
      (await exec(process.execPath, [...args, ...more], { cwd: temporary, env, timeout: 10000 })).stdout,
    ).data
  assert.equal((await run(['health'])).ok, true)
  const doctor = await run(['--fail-on-warning', 'config', 'doctor'])
  assert.equal(doctor.ok, true)
  assert.deepEqual(doctor.warnings, [])
  for (const document of ['CLI.md', 'API.md', 'SECURITY.md', 'docs/CLI.md'])
    assert((await fs.stat(path.join(install, 'node_modules', 'strata', document))).size > 0)
  const first = await run(['agent', 'capture', '# Installed package\nNative SQLite is working'])
  const second = await run(['agent', 'capture', '# Installed package\nNative SQLite is working'])
  assert.equal(first.noteId, second.noteId)
  assert.equal(second.duplicate, true)
  const context = await run(['agent', 'context', 'search', 'Installed'])
  assert.equal(context.notes[0].id, first.noteId)
  const exit = new Promise((resolve) => server.once('exit', resolve))
  server.kill('SIGTERM')
  await Promise.race([
    exit,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Installed server did not shut down')), 5000).unref(),
    ),
  ])
  assert.equal(server.exitCode, 0)
  console.log(
    'Installed CLI package verified: native database, authenticated server, installed documentation/doctor, capture deduplication, retrieval and shutdown.',
  )
} finally {
  if (server && server.exitCode === null) server.kill('SIGTERM')
  await fs.rm(temporary, { recursive: true, force: true })
}
