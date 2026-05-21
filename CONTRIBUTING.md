# Contributing

Thanks for your interest in contributing to responses.js.

## Commit message convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) to drive automated versioning and changelog generation via [release-please](https://github.com/googleapis/release-please).

### Format

```
<type>(<optional scope>): <subject>
```

Examples:

- `feat: add streaming reasoning summaries`
- `fix(mcp): handle SSE transport reconnection`
- `chore: bump dependencies`
- `feat!: drop support for Node 18` (breaking change — note the `!`)

### Allowed types

| Type       | Changelog section        | Triggers release? |
| ---------- | ------------------------ | ----------------- |
| `feat`     | Features                 | Minor bump        |
| `fix`      | Bug Fixes                | Patch bump        |
| `perf`     | Performance Improvements | Patch bump        |
| `revert`   | Reverts                  | Patch bump        |
| `build`    | Dependencies             | Patch bump        |
| `chore`    | (hidden)                 | No                |
| `ci`       | (hidden)                 | No                |
| `docs`     | (hidden)                 | No                |
| `style`    | (hidden)                 | No                |
| `refactor` | (hidden)                 | No                |
| `test`     | (hidden)                 | No                |

Append `!` after the type/scope (e.g. `feat!:`, `fix(api)!:`) or include `BREAKING CHANGE:` in the commit body to trigger a major bump.

## Pull requests

This repository uses **squash merge**, so the PR title becomes the commit on `main`. The PR title MUST follow the Conventional Commits format — a CI check (`PR Title`) enforces this and will block merges otherwise.

Individual commits on your feature branch don't need to follow the convention (they get squashed away), but doing so helps reviewers and lets the local `commit-msg` hook catch typos early.

## Local setup

`pnpm install` will set up the local `commit-msg` git hook via husky. The hook runs `commitlint` against your commit messages.

To bypass the hook in an emergency: `git commit --no-verify`. Use sparingly — the PR title CI check is the real gate.

## Releases

Releases are fully automated:

1. Merge PRs to `main` with Conventional Commit titles.
2. [release-please](https://github.com/googleapis/release-please) maintains an open "Release PR" that aggregates changes since the last release, bumps `package.json`, and updates `CHANGELOG.md`.
3. Merging the Release PR creates a git tag (`vX.Y.Z`) and a GitHub Release.

No manual version bumps. No manual changelog edits.
