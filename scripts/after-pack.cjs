const fs = require('node:fs')
const path = require('node:path')
const { Arch } = require('builder-util')

module.exports = async function trimNativePrebuilds(context) {
  const platform = context.electronPlatformName
  const arch = Arch[context.arch]
  const resourcesDir =
    'darwin' === platform
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources',
        )
      : path.join(context.appOutDir, 'resources')
  const prebuildsDir = path.join(
    resourcesDir,
    'app.asar.unpacked',
    'node_modules',
    'better-sqlite3',
    'prebuilds',
  )
  if (!fs.existsSync(prebuildsDir)) return

  const expected = `${platform}-${arch}.node`
  for (const entry of fs.readdirSync(prebuildsDir)) {
    if (entry.endsWith('.node') && entry !== expected) fs.rmSync(path.join(prebuildsDir, entry))
  }
}
