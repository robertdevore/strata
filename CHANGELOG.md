# Changelog

## 0.8.0 - 2026-08-11

### Changed

- Preserved provider tool-call context across AI tool loops and emitted tool results with the required role and call identifier.
- Removed unused Three.js prototype dependencies from the production branch to reduce install and package weight.
- Updated transitive security overrides and the Electron packaging toolchain.
- Updated the SQLite native binding for compatibility with the release Electron runtime.
- Corrected package-manager detection so release installers exclude development dependencies.
- Restricted packaged build inputs to runtime bundles so stale installer output cannot be nested into a new release.
- Reduced the README to install, usage, automation, development, and security essentials.

### Fixed

- Corrected multi-step tool behavior for OpenAI-compatible, Anthropic, and Gemini providers.
- Locked exact tag filtering behavior with a regression test.

### Security

- Resolved all npm audit findings present at release preparation time.

## 0.7.0 - 2026-08-08

- Added database recovery and backup restore safeguards.
- Hardened startup and packaged native SQLite bindings.
- Added current-version display in the sidebar.
