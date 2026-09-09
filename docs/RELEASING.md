# Desktop release procedure

Strata ships a macOS DMG, Windows NSIS installer and Linux AppImage. Build each on its native operating system and architecture. `package.json` is the target/icon configuration; `scripts/after-pack.cjs` removes other platforms' SQLite prebuilds from the unpacked native directory. The application and preload/renderer assets live in `app.asar`; the native SQLite module remains unpacked.

Use `npm run release -- mac`, `npm run release -- win` or `npm run release -- linux`. The script checks the native platform, runs source verification and builds without publishing. macOS/Windows require successful signing; macOS also refuses to start without a complete notarization credential group. The explicit builder commands below describe its packaging stage. `npm run release -- --help` is read-only.

## Verification before distribution

Use a clean checkout of the intended tag, Node 22 or later, and `npm ci`. Run `npm run verify`, `npm audit --audit-level=high`, `npm run package:verify` and `npm run package:electron:verify`. The last command creates a temporary unsigned directory and executes its bundled SQLite/FTS runtime. It does not prove an installer works. `npm run desktop:verify` exercises a disposable library, including saved drafts, conflicts, approval and backup restore.

Run installer acceptance on a clean machine: install, launch, create/edit/search a note, close/reopen, create/restore a backup, then upgrade from the previous release while retaining the library. Check the platform's signature verification separately. Never point automated acceptance at a real user's library. Keep previous installers and a backup made before first opening a newer schema; an older Strata intentionally refuses a future database schema.

## macOS

Provide a Developer ID Application identity through the build machine's keychain or Electron Builder's `CSC_LINK` and `CSC_KEY_PASSWORD` secrets. Provide one supported notarization credential group:

- `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`;
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`;
- `APPLE_KEYCHAIN`, `APPLE_KEYCHAIN_PROFILE`.

Keep values in the local keychain or protected CI secrets. Do not add credentials, certificates or private keys to this repository, build arguments, logs, note backups or artifacts. Electron Builder 26's installed `macOptions` contract documents these groups; see its [macOS configuration](https://www.electron.build/mac/).

After building the application, create a signed installer with `npx electron-builder --mac dmg --publish never -c.forceCodeSigning=true -c.mac.hardenedRuntime=true -c.mac.notarize=true`. Notarization requires its own credentials; `forceCodeSigning` alone does not establish notarization. Verify the resulting application with `codesign --verify --deep --strict` and `spctl --assess --type execute`, and validate the stapled ticket with `xcrun stapler validate`. Record the exact artifact, architecture and verification output. Build and test x64 and arm64 independently before advertising support for both.

## Windows

Configure a trusted signing certificate using Electron Builder's `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`, or an intentionally configured platform signing service. After building, run `npx electron-builder --win nsis --publish never -c.forceCodeSigning=true`. Verify the installer signature with Windows `Get-AuthenticodeSignature`, then exercise install, upgrade and uninstall on Windows. An unsigned directory smoke test is not a signed NSIS release. See [Windows configuration](https://www.electron.build/win/).

## Linux

After building, run `npx electron-builder --linux AppImage --publish never`. Test the executable AppImage on supported distributions, including a machine where the expected FUSE support is absent. Document any extraction/run requirement rather than assuming the packaging command proves launch compatibility. Verify the bundled native module on each supported architecture.

## Updates and publication

Updates are manual downloads from GitHub Releases. Strata has no automatic update service, background update check or mandatory account. No release command should publish implicitly; use `--publish never`, review the installer and checksums, then publish the selected artifacts deliberately. Include version, operating system, architecture, SHA-256 checksum, schema compatibility and migration/recovery notes in the release entry.

The ordinary `npm run dist` is a local build convenience, not evidence of signing or notarization. Existing CI verifies Linux/macOS source and installed CLI behavior plus an unsigned macOS native directory and desktop interactions. Windows installer acceptance, Linux AppImage acceptance, Apple notarization and certificate-backed Windows signing require their respective environments and credentials; do not claim them from a successful source build.
