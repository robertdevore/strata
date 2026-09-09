# Strata 0.9.0 local macOS test build

This DMG contains the hardening upgrade described in [the final report](hardening/FINAL-REPORT.md). It is an unsigned, unnotarized Intel (x64) local test build, not a signed public release. The database schema remains13.

Quit the old Strata app and make a backup before opening0.9.0 against your existing library. Open the DMG and drag Strata to Applications, replacing the previous application. If macOS blocks this local build, use the system's Open Anyway flow after reviewing the application. Keep the previous installer and pre-upgrade backup; older versions may not support the upgraded library. Test create/edit/search, close/reopen, AI confirmation and backup/restore.

The build does not install itself, launch against your real library, or publish a GitHub release. Native SQLite/FTS and packaged application startup are checked using temporary data.

To reproduce after `npm run verify`:

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg --x64 --publish never -c.mac.identity=null -c.directories.output=release/0.9.0
```

Use [RELEASING.md](RELEASING.md) for signed distribution requirements.
