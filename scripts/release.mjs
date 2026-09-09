import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const targets = { mac: ['darwin', 'dmg'], win: ['win32', 'nsis'], linux: ['linux', 'AppImage'] }
const target = process.argv[2]
if (target === '--help') {
  console.log(
    'Usage: npm run release -- mac|win|linux. Builds locally on the target OS; never publishes. mac/win require signing; mac also requires notarization credentials. See docs/RELEASING.md.',
  )
} else {
  try {
    if (!Object.hasOwn(targets, target) || process.argv.length !== 3)
      throw new Error('Choose mac, win or linux. See --help.')
    if (process.platform !== targets[target][0])
      throw new Error('Build and verify on the target operating system.')
    if (target === 'mac') {
      const groups = [
        ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'],
        ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'],
        ['APPLE_KEYCHAIN', 'APPLE_KEYCHAIN_PROFILE'],
      ]
      if (!groups.some((group) => group.every((name) => process.env[name]?.trim())))
        throw new Error('macOS release requires notarization credentials. See docs/RELEASING.md.')
    }
    if (!process.env.npm_execpath) throw new Error('Run through npm run release.')
    execFileSync(process.execPath, [process.env.npm_execpath, 'run', 'verify'], { stdio: 'inherit' })
    const require = createRequire(import.meta.url)
    const args = [
      require.resolve('electron-builder/out/cli/cli.js'),
      `--${target}`,
      targets[target][1],
      '--publish',
      'never',
    ]
    if (target !== 'linux') args.push('-c.forceCodeSigning=true')
    if (target === 'mac') args.push('-c.mac.hardenedRuntime=true', '-c.mac.notarize=true')
    execFileSync(process.execPath, args, { stdio: 'inherit' })
  } catch (error) {
    console.error(
      error instanceof Error && !('status' in error)
        ? error.message
        : 'Release verification or packaging failed.',
    )
    process.exitCode = 1
  }
}
