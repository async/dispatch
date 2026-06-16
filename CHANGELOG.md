# Changelog

## 0.0.6 - 2026-06-14

- Release `@async/dispatch@0.0.6`.

## 0.0.5 - 2026-06-14

- Document npm install flow.
- Make npm visibility verification robust against registry propagation.

## 0.0.4 - 2026-06-14

### Fixed

- Use supported npm access syntax after publish.
- Keep npm visibility verification in the publish workflow.
- Release `@async/dispatch` with installable `async-dispatch` bin metadata.

### Verification

- `pnpm run release:check`

## 0.0.3 - 2026-06-14

### Fixed

- Normalize the `async-dispatch` bin path for npm package metadata.
- Use npm publish dry-run in release verification.
- After publish, force public npm access and verify registry visibility from the
  publish job.

### Verification

- `pnpm run release:check`

## 0.0.2 - 2026-06-14

### Fixed

- Fix CI release verification to use package-installed Async helper imports
  instead of sibling checkout paths.

### Added

- Publish the installable `async-dispatch` CLI package with bundled skill
  installation support, Work Discovery console, and Dispatch-native control
  guidance.

### Verification

- `pnpm run release:check`

## 0.0.1 - 2026-06-14

### Added

- Package the `async-dispatch` CLI with bundled Codex skill installation
  commands.
- Add the Dispatch Work Discovery console board and `/api/work` projection.
- Replace imported workflow lessons with Dispatch-native control discipline.
- Expand async coding pattern guidance for Dispatch skills.

### Verification

- `pnpm run release:check`
