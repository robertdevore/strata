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

- Strata is local-first by design.
- The local HTTP API can be protected with `STRATA_API_TOKEN`.
- `window.strata.shell.run` is a privileged local IPC capability and should only be used with trusted command strings.
