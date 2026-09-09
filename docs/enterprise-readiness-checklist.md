# Enterprise Readiness Checklist

Historical checklist from before the full hardening upgrade. Its optional-auth and prior release assertions are not current policy. Use [AGENTS.md](../AGENTS.md), [SECURITY.md](../SECURITY.md), the [hardening evidence](hardening/requirements.md) and [release procedure](RELEASING.md) for the current contract.

Use this checklist before a production or managed rollout.

## Documentation

- [x] README includes architecture, install, scripts, API overview
- [x] API reference includes endpoint behavior and error model
- [x] AI editing controls and audit/revert behavior documented
- [x] Publish provider and shell execution boundary documented
- [x] Security policy available (`SECURITY.md`)
- [x] Contribution policy available (`CONTRIBUTING.md`)
- [x] Code of conduct available (`CODE_OF_CONDUCT.md`)

## Security & Control

- [x] Optional API token auth (`STRATA_API_TOKEN`)
- [x] Local-first data model documented
- [x] AI edit history + revert flow documented
- [x] Shell execution capability documented as privileged
- [ ] Independent security review completed

## Reliability & Operations

- [x] Backup workflow documented (`scripts/backup-notes.sh`)
- [x] Build and packaging flow documented (`npm run dist`)
- [x] Troubleshooting guidance present
- [ ] CI policy for lint/test/build enforced on every PR
- [ ] Release sign-off template finalized

## Governance

- [x] Security reporting process defined
- [x] Contributor workflow defined
- [x] Community conduct baseline defined
- [ ] SLA/support policy explicitly documented

## Notes

Items marked unchecked are recommended next steps for enterprise rollout.
