# Contributing

Thanks for contributing to Strata.

## Development Setup

Requirements:

- Node.js 20+
- npm

Setup:

```bash
npm install
npm run dev
```

## Quality Checks

Run these before opening a pull request:

```bash
npm run lint
npm run test
npm run build
```

## Pull Request Guidelines

- Keep changes scoped and focused.
- Include tests for behavior changes when practical.
- Update docs (`README.md`, `API.md`, `docs/*`) when public behavior changes.
- Prefer small, descriptive commits.

## Commit Message Guidance

Use concise, intent-first messages, for example:

- `feat: add related notes API endpoint`
- `fix: enforce aiEditMode read_only in AI tool handlers`
- `docs: clarify publish shell execution boundary`

## Security-Sensitive Changes

For changes touching:

- auth/token handling
- IPC or shell execution
- persistence/migrations

include a short risk note in the PR description.
