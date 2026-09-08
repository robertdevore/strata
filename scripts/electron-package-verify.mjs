import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const exec = promisify(execFile)
const require = createRequire(import.meta.url)
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'strata-electron-'))
try {
  const cli = path.join(path.dirname(require.resolve('electron-builder/package.json')), 'out/cli/cli.js')
  const args = [cli, '--dir', '--publish', 'never', `-c.directories.output=${temporary}`]
  if (process.platform === 'darwin') args.push('-c.mac.identity=null')
  await exec(process.execPath, args, {
    timeout: 300000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  })
  const names = await fs.readdir(temporary)
  const directory = names.find((name) =>
    process.platform === 'darwin' ? name === 'mac' || name.startsWith('mac-') : name.endsWith('-unpacked'),
  )
  if (!directory) throw new Error('Packaged application directory missing')
  const root = path.join(temporary, directory)
  const executable =
    process.platform === 'darwin'
      ? path.join(root, 'Strata.app/Contents/MacOS/Strata')
      : path.join(root, process.platform === 'win32' ? 'Strata.exe' : 'strata')
  const resources =
    process.platform === 'darwin'
      ? path.join(root, 'Strata.app/Contents/Resources')
      : path.join(root, 'resources')
  const smoke = `
    const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
    const archive = path.join(process.argv[1], 'app.asar');
    for (const file of ['dist/main/main.js', 'dist/preload/preload.mjs', 'dist/renderer/index.html']) assert(fs.statSync(path.join(archive,file)).size > 0);
    const D = require(path.join(archive,'node_modules/better-sqlite3'));
    const db = new D(':memory:');
    db.exec("CREATE VIRTUAL TABLE docs USING fts5(content); INSERT INTO docs VALUES ('native smoke')");
    assert.equal(db.prepare('SELECT content FROM docs WHERE docs MATCH ?').get('native').content, 'native smoke');
    assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
    console.log(JSON.stringify({electron:process.versions.electron,sqlite:db.prepare('select sqlite_version() AS version').get().version,platform:process.platform,arch:process.arch}));
    db.close();
  `
  const result = await exec(executable, ['-e', smoke, resources], {
    timeout: 20000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  console.log(`Packaged Electron native runtime verified: ${result.stdout.trim()}`)
} finally {
  await fs.rm(temporary, { recursive: true, force: true })
}
