# Dependency security checkpoints

## 2026-09-08 refreshed advisory data

A fresh full `npm audit --json` reported four affected packages after an earlier zero-advisory checkpoint. These paths are development/build tooling in Strata, rather than the shipped note/AI runtime:

| Dependency path | Before | Patched version | Reported issue |
|---|---|---|---|
| Electron Builder and ESLint → js-yaml | 4.3.1 | 4.3.2 | High: empty YAML merge sources can bypass the CPU-work limit. [Advisory](https://github.com/advisories/GHSA-2883-xcg3-v3hh) |
| Vitest → @vitest/mocker | 3.2.6 | 4.1.11 | Moderate: redirect mocks can read files outside the dev-server allowlist. The standalone public mocker plugin is the unauthenticated path; Strata does not configure that plugin. [Advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) |
| wait-on → joi | 18.2.3 | 18.2.8 | Low: prototype changes through message language keys or rename templates. [Message-key advisory](https://github.com/advisories/GHSA-6w3j-5fw6-r9vr), [rename advisory](https://github.com/advisories/GHSA-gg4h-3hg2-grpc) |

Vitest 3 has no patched release for this advisory. The upgrade uses the maintained 4.1.11 fix rather than adopting version 5. Its published Node/Vite peer ranges support the repository's Node 22 CI and Vite 7. The obsolete `minWorkers` option was removed; the existing two-worker limit remains. See the [Vitest 4 migration guide](https://v4.vitest.dev/guide/migration).

The js-yaml/joi updates remain within their parent dependency ranges. The remaining lockfile changes are Vitest's dependency graph; application dependency versions are unchanged in this checkpoint. `npm run verify` passed all 257 tests in 60 files, formatting, ESLint, TypeScript and the production build with Vitest 4.1.11. The refreshed audit after installation reported zero vulnerabilities. These are point-in-time registry results, not a guarantee against undisclosed vulnerabilities.

## Installed override review

The final installed-tree inspection (`npm ls --all --json`) found the following uses. These exact pins retain the previously selected security fixes while upstream parent ranges are broader or lag behind them. Overrides can cross a parent's original major range, so passing `npm audit` alone is not a compatibility test. Source verification, a production CLI tarball installation and packaged native execution cover the paths Strata actually exercises. Installer signing remains a separate release gate.

| Pin | Installed path / reason to retain |
|---|---|
| `tmp` 0.2.7 | Electron Builder → Flatpak bundler → tmp-promise; temporary build files. |
| `@xmldom/xmldom` 0.8.15 | Electron Builder → plist; XML/plist parsing during packaging. |
| `minimatch` 10.2.5 / `brace-expansion` 5.0.9 | Builder archive/file selection and ESLint glob matching. These major-range overrides receive build/package verification. |
| `lodash` 4.18.1 | Builder platform helpers and wait-on. |
| `flatted` 3.4.2 | ESLint's file-entry-cache serialization. |
| `ws` 8.21.0 | jsdom test tooling; not the notes API transport. |
| `postcss` 8.5.23 / `nanoid` 3.3.18 | Vite CSS processing and its ID dependency. |
| `picomatch` 4.0.4 | Vite/fdir/tinyglobby file selection. |
| `axios` 1.18.1 / `follow-redirects` 1.16.0 | wait-on development readiness checks. AI providers use the bounded native-fetch transport, not Axios. |
| `esbuild` 0.28.1 | Vite and tsx. This also supports the shipped CLI's TypeScript launcher, so installed production-package verification matters. |

Removed the unused `ip-address` override: no installed dependency path uses it. Do not add speculative pins for packages outside the dependency graph. Revisit each remaining override when updating its parent; remove it when the parent resolves to an acceptable version and the relevant checks pass.

The direct runtime graph remains SQLite, React/CodeMirror/Markdown, validation/CLI utilities and tsx; no hosted service, vector database or new AI SDK was added. Electron 41.10.3 and better-sqlite3 13.0.3 were exercised in the packaged native runtime, including a worker loading the unpacked module. Source tests use Vite 7 and Vitest 4. The fresh final audit returned **zero vulnerabilities at every severity**, and `npm ls` completed without dependency-tree errors. Record future advisory changes as new evidence, not revisions to these historical results.
