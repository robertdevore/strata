# Security Policy

## Supported Versions

Strata currently supports the latest `main` branch and the most recent release tag.

## Reporting a Vulnerability

Please do not open public issues for sensitive vulnerabilities.

Use one of these channels:

- GitHub Security Advisories (preferred)
- A private email to the maintainers

Include the following in your report:

- Affected version/commit
- Platform details (OS, architecture)
- Reproduction steps
- Proof-of-concept input
- Impact assessment

## Response Targets

- Initial triage response: within 3 business days
- Confirmed vulnerability assessment: within 7 business days
- Fix timeline: based on severity and exploitability

## Disclosure Policy

- We follow coordinated disclosure.
- Please allow time for a fix before public disclosure.
- We will credit reporters unless anonymity is requested.

## Security Boundaries

- Strata is a local-first Electron application with a SQLite library, a loopback automation API and an HTTP-only CLI. Notes, revision history and provider credentials are sensitive assets.
- The local HTTP API requires a random local credential by default. Explicit `STRATA_API_TOKEN` configuration is supported; non-loopback bindings and browser-origin requests are rejected. Localhost alone is not authentication.
- The renderer is sandboxed with context isolation and no Node integration. The arbitrary `window.strata.shell.run` bridge has been removed. Publishing uses narrow operations and a native-selected destination.
- Every IPC invoke handler validates the sender against the current main WebContents, its main frame and the exact application document URL before dispatch. Auxiliary windows and child frames have no authority to invoke the bridge, even if they load a preload script.
- Production HTML embeds a restrictive CSP because the application loads a `file://` document. Unexpected document navigation and new windows are denied; intentionally opened external URLs are protocol-validated.
- Permission checks and requests allow only audio capture and sanitized clipboard writes from the application main frame. Camera, location, other device access, child frames and auxiliary windows are denied. Audio still requires applicable OS authorization.
- PDF and print documents embed their own restrictive CSP before caller HTML, disable JavaScript, and accept at most 8,388,608 HTML characters. Inline layout and data-embedded images/fonts are allowed; remote and local-file resource fetches are blocked.
- Provider credentials use OS-encrypted storage. Ordinary settings expose presence markers, and generated backups are sanitized. Legacy standalone libraries must complete desktop credential migration before serving requests.
- Notes, imported Markdown, AI tool arguments and provider responses are untrusted input. Rendered content must not gain privileged execution, and AI writes must obey the configured mode, validated service contracts and original revision preconditions.

## Review Guidance

Review the API authentication boundary, preload/IPC capabilities, content rendering, filesystem exports, provider requests, credential migration, backup recovery and concurrent mutations. A local deployment does not make browser-origin attacks, credential exposure or silent stale-write data loss harmless. Establish reachability and impact from current code; historical audit documents are not evidence that a control works.

The ongoing hardening work and remaining validation gaps are tracked in `docs/hardening/requirements.md`. Those gaps are not exclusions or accepted risks. Platform packaging, OS credential behavior and actual desktop controls require their own verification; unit tests alone do not establish release readiness.
