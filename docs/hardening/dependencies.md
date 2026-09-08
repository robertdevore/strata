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

The broader override rationale and final release dependency review remain tracked in the requirement ledger.
