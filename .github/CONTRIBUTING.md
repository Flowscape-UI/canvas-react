# Contributing to @flowscape-ui/canvas-react

Thanks for your interest in contributing!

This document summarizes how to set up the project, coding conventions, and the PR process. Please read it before submitting changes.

## Prerequisites

- Node.js >= 18
- Bun 1.1.9 (recommended for scripts)
- Git

## Getting started

```bash
bun install
bun run typecheck
bun run lint
bun run build
```

> Note: Storybook, tests (Vitest), and release workflows will be added in subsequent tasks per roadmap.

## Branching model

- Create a feature branch from `main`: `feat/<short-name>` or `fix/<short-name>`
- Keep PRs small and focused. Prefer several small PRs over a massive one.

## Commit messages

Use Conventional Commits:

- `feat: ...` new feature
- `fix: ...` bug fix
- `chore: ...` tooling or housekeeping
- `docs: ...`, `refactor: ...`, `test: ...`, etc.

Examples:

- `feat(core): add world<->screen conversions`
- `fix(canvas): prevent scroll jitter on pinch`

## Linting & formatting

- ESLint + Prettier are enforced. Run:

```bash
bun run lint
bun run format
```

CI will fail if lint/format/typecheck fail.

## Pull requests

- Ensure the checklist before creating/marking PR ready for review:
  - [ ] `bun run typecheck` passes
  - [ ] `bun run lint` passes (or `bun run lint:fix`)
  - [ ] `bun run build` succeeds
  - [ ] No noisy diffs (lockfiles only when deps changed)
  - [ ] Reasonable tests if applicable (coming soon)
- Request review. Provide a brief description and screenshots/GIFs for UI changes.
- We squash merge PRs into `main`.

## Releases

- We use Changesets + GitHub Actions to manage releases (to be enabled soon).
- Release PRs are opened by the `release` workflow. After merge, the package is published to npm with provenance.

## Security

- Do not report vulnerabilities in public issues.
- See `SECURITY.md` for reporting instructions and response targets.

## Code of Conduct

- Be respectful and constructive. We follow common open-source etiquette.

## Questions

Open a GitHub Discussion or Issue if you have questions. Thank you for contributing!
