# Async Work Patterns

Use this reference when deciding whether one codebase task can become multiple async lanes. Split only when lanes have separate ownership, useful intermediate receipts, and a clear root integration point.

## Lane Rules

- Each lane needs one owner, one purpose, exact files or modules, and a verification command.
- Root owns interface decisions, integration, final verification, and completion judgment.
- Prefer two lanes before three or four.
- Do not split when files overlap, design is unsettled, or coordination costs exceed the work.
- If no lane has runnable or due work, let Dispatch move to `idle`, `paused-human`, or `waiting-external`.

## Patterns

### Tests And Code

- Test lane owns test files, fixtures, expected failures, and acceptance commands.
- Code lane owns implementation files only.
- Root runs the test lane against the code lane as soon as the test is runnable and the code lane reaches the touched interface.

Use when tests can come online before implementation is complete.

### Contract And Implementation

- Contract lane owns CLI/API/schema shape, examples, and compatibility expectations.
- Implementation lane owns internals that satisfy the contract.
- Root resolves contract changes before implementation expands.

Use when ambiguity around public behavior would otherwise block or churn code.

### Docs/Examples And Runtime

- Docs lane owns README, templates, examples, and visible workflow text.
- Runtime lane owns implementation.
- Root compares promised workflow against actual CLI behavior before accepting either lane.

Use when docs can expose missing states, naming drift, or bad operator ergonomics early.

### Model/Storage And Console

- Model lane owns ledger shape, mutations, and scheduler state.
- Console lane owns rendering once the snapshot shape is stable enough.
- Root prevents the console lane from inventing state not produced by the model.

Use for state-machine features where UI visibility matters.

### Parser Fixtures And Compiler Output

- Fixture lane owns markdown/JSON examples and expected parsed shape.
- Compiler lane owns parser, compiler, or board/runtime generation code.
- Root uses fixture failures to decide whether the parser or expectation is wrong.

Use when generated output must stay traceable.

### Migration And Validation

- Migration lane owns the updater or mechanical rewrite.
- Validation lane owns detector scripts, dry-run checks, and partial-output failures.
- Root runs validation before and after migration.

Use when a broad mechanical change risks silent partial updates.

### Scout And Implementation

- Scout lane is read-only and maps affected files, dirty state, ownership, and risks.
- Implementation lane starts after root approves the boundary.
- Root narrows or cancels implementation when scout finds overlap or hidden state.

Use when discovery can unblock implementation without writing.

### Benchmark And Optimization

- Benchmark lane owns repeatable measurement.
- Optimization lane owns code changes.
- Root rejects performance claims without benchmark evidence.

Use when optimization otherwise becomes anecdotal.

### Release Watcher And Code Repair

- Watcher lane owns CI, package visibility, external settings, and timed waits.
- Repair lane owns code fixes.
- Root records real timers with `runtime wait` instead of sleep-looping.

Use when external propagation can happen while code work continues.

### Refactor Shell And Behavior Preservation

- Preservation lane owns golden tests, snapshots, or behavior assertions.
- Refactor lane owns mechanical structure changes.
- Root integrates only when preservation proof passes against refactored code.

Use when cleanup is safe only with a behavior guard.

### Reproduction And Fix

- Repro lane owns a minimal failing test, script, fixture, or command transcript.
- Fix lane owns the smallest implementation change that makes the repro pass.
- Root rejects fixes that cannot run against the repro lane.

Use when a bug is not yet pinned down or the failure is easy to misdiagnose.

### Type Boundary And Runtime Behavior

- Type lane owns exported types, schema declarations, generated declarations, and compile checks.
- Runtime lane owns implementation behavior and runtime tests.
- Root decides whether a type change is a public contract change before runtime expands.

Use when TypeScript/API shape and runtime behavior can drift independently.

### Port/Adapter And Domain Core

- Domain lane owns pure business rules, state transitions, and domain tests.
- Adapter lane owns CLI, HTTP, filesystem, database, browser, or third-party API integration.
- Root verifies the adapter does not leak infrastructure assumptions into domain code.

Use when hexagonal boundaries let one worker build core behavior while another wires edges.

### API Producer And Client Consumer

- Producer lane owns server/API/CLI output, status codes, schema, and compatibility receipts.
- Consumer lane owns client SDK, UI state, command caller, or downstream usage.
- Root owns the contract handshake and runs a compatibility smoke before accepting either lane.

Use when both sides of an internal contract live in the same repo but should not churn each other.

### Data Migration And Runtime Read Path

- Migration lane owns schema changes, codemods, seed data, and rollback notes.
- Read-path lane owns query code, loaders, selectors, or compatibility fallback behavior.
- Root requires a fixture or dry-run that proves old and new data are handled intentionally.

Use when changing persisted shape while code still needs to read existing state.

### Feature Flag Shell And Feature Implementation

- Flag lane owns config, kill switch, default state, and guarded entry points.
- Feature lane owns the new behavior behind the flag.
- Root verifies the off path still behaves exactly as before.

Use when risky behavior should merge behind a switch before rollout.

### Dependency Upgrade And Compatibility Repair

- Upgrade lane owns dependency version changes, lockfile updates, and package-manager diagnostics.
- Repair lane owns source changes required by the new dependency behavior.
- Root decides whether failures are upgrade regressions, existing bugs, or unsupported environment issues.

Use when an upgrade can proceed while compatibility fixes are being isolated.

### Build/CI Wiring And Product Code

- CI lane owns workflow files, build scripts, cache inputs, environment assumptions, and release gates.
- Product lane owns source behavior.
- Root checks that CI proves the intended product behavior, not only that the workflow runs.

Use when build failures and product failures are easy to conflate.

### Observability And Behavior Change

- Observability lane owns logs, metrics, tracing spans, debug counters, or receipt fields.
- Behavior lane owns the state change or user-visible fix.
- Root rejects behavior claims that cannot be observed through the agreed signal.

Use when the fix must be diagnosable after merge or during a staged rollout.

### Accessibility/Interaction QA And UI Code

- QA lane owns keyboard, screen reader, mobile, visual, or browser evidence.
- UI lane owns component and style changes.
- Root compares QA evidence against the UI lane before marking the feature done.

Use when frontend behavior can look correct while failing interaction or accessibility checks.

### Fixture/Data Generator And Feature Logic

- Fixture lane owns representative sample data, synthetic generators, and edge cases.
- Feature lane owns code that consumes that data.
- Root keeps generated data deterministic enough for repeatable verification.

Use when hard-coded happy-path data would hide real integration failures.

## Recording Lanes

Record each lane independently:

```bash
async-dispatch runtime plan-code <ledgerId> --objective "..." --route subagent-worktree --worktree "../lane-name" --ownership "..." --verify "..."
```

Use `domain-owner-chat` instead of `subagent-worktree` when the lane belongs to a long-lived repo/domain owner.

## Status Examples

Use these examples to decide how async lanes should report status and when root should poll, run cross-lane checks, pause, wait, or go idle.

`runtime plan-code` persists routing state before launch. After launch, record
progress on the worker or node that owns the lane. Timeline values below are
worker/node reporting terms unless the row explicitly says `needs-boundary`,
`ready-to-dispatch`, `ready-for-domain-owner`, or `root-owned`.

### Example 1: Tests And Code

Initial plan:

```bash
async-dispatch runtime plan-code <ledgerId> --objective "Add failing tests for idle/wake scheduler" --route subagent-worktree --worktree "../dispatch-tests" --ownership "test/goal-first.test.js" --verify "pnpm test"
async-dispatch runtime plan-code <ledgerId> --objective "Implement idle/wake scheduler" --route subagent-worktree --worktree "../dispatch-code" --ownership "src/model.js src/cli.js src/console-server.js" --verify "pnpm test"
```

Status timeline:

| Time | Test lane | Code lane | Root action | Scheduler |
| --- | --- | --- | --- | --- |
| T0 | `ready-to-dispatch` | `ready-to-dispatch` | Launch both lanes after boundary review. | `active` |
| T1 | `ready-for-review`: red test exists | `domain-active` or worker active | Run the red test against the code lane if the touched interface exists. | `active` |
| T2 | `blocked`: test is valid but implementation is not ready | active | Keep code lane moving; do not ask human yet. | `active` |
| T3 | `ready-for-review`: test now passes against code | `ready-for-review` | Review both diffs, integrate, run final verification. | `active` |
| T4 | `done` | `done` | Record receipts; close or idle lanes. | `idle` if no more work |

If T1 fails because the test assumes the wrong public contract, root changes the test lane to `blocked` with `blockedBy: root-contract`, resolves the interface decision, then wakes the affected lane.

### Example 2: Contract And Implementation

Initial plan:

```bash
async-dispatch runtime plan-code <ledgerId> --objective "Define CLI contract for runtime wait/wake" --route root --ownership "README.md src/cli.js" --verify "async-dispatch help"
async-dispatch runtime plan-code <ledgerId> --objective "Implement runtime wait/wake internals" --route domain-owner-chat --domain dispatch-runtime --ownership "src/model.js src/store.js" --verify "pnpm test"
```

Status timeline:

| Time | Contract lane | Implementation lane | Root action | Scheduler |
| --- | --- | --- | --- | --- |
| T0 | `root-owned` | `needs-boundary` until ownership/verify are explicit | Root finalizes command names before implementation expands. | `active` |
| T1 | `ready-for-review` | `blocked`: waiting for CLI contract | Review contract, accept or revise. | `active` |
| T2 | `done` | `active` | Send accepted contract to implementation lane. | `active` |
| T3 | `done` | `ready-for-review` | Run contract smoke and full tests. | `active` |
| T4 | `done` | `done` | Record receipts. | `idle` if no more work |

If contract review needs a human product decision, use `paused-human`. If implementation is waiting on a real timer or external service, use `waiting-external`.

### Example 3: Docs/Examples And Runtime

Initial plan:

```bash
async-dispatch runtime plan-code <ledgerId> --objective "Document code dispatch routing examples" --route subagent-worktree --worktree "../dispatch-docs" --ownership "README.md skills/dispatch-code-routing/references/async-work-patterns.md" --verify "python3 <validator> skills/dispatch-code-routing"
async-dispatch runtime plan-code <ledgerId> --objective "Add runtime state support for code dispatch plans" --route subagent-worktree --worktree "../dispatch-runtime" --ownership "src/model.js src/console-server.js test/goal-first.test.js" --verify "pnpm test"
```

Status timeline:

| Time | Docs lane | Runtime lane | Root action | Scheduler |
| --- | --- | --- | --- | --- |
| T0 | active | active | Let docs expose intended operator flow while runtime implements it. | `active` |
| T1 | `ready-for-review` | active | Compare docs claims to current implementation; feed mismatches to runtime lane. | `active` |
| T2 | `blocked`: docs mention unsupported command | active | Either change docs or update runtime plan. Root owns this decision. | `active` |
| T3 | `ready-for-review` | `ready-for-review` | Run CLI help, validator, and tests. | `active` |
| T4 | done | done | Record receipts. | `idle` if no more work |

Do not let docs invent behavior that the runtime cannot produce. Do not let runtime add behavior that the docs and examples fail to explain.

### Example 4: Scout And Implementation

Initial plan:

```bash
async-dispatch runtime plan-code <ledgerId> --objective "Scout scheduler files and dirty state" --route subagent --ownership "read-only" --verify "report affected files and risks"
async-dispatch runtime plan-code <ledgerId> --objective "Implement scheduler change after scout boundary" --route root --ownership "pending scout" --verify "pnpm test"
```

Status timeline:

| Time | Scout lane | Implementation lane | Root action | Scheduler |
| --- | --- | --- | --- | --- |
| T0 | active | `blocked`: waiting for scout boundary | Run scout first because implementation ownership is unknown. | `active` |
| T1 | `ready-for-review`: affected files listed | blocked | Root accepts, narrows, or cancels implementation boundary. | `active` |
| T2 | done | active | Implementation starts with exact allowed files. | `active` |
| T3 | done | `ready-for-review` | Root reviews diff against scout boundary. | `active` |
| T4 | done | done | Record receipt. | `idle` if no more work |

If scout finds overlapping ownership with another active lane, stop the implementation lane before edits begin.

### Example 5: Release Watcher And Code Repair

Initial plan:

```bash
async-dispatch runtime plan-code <ledgerId> --objective "Watch npm propagation and CI state" --route domain-owner-chat --domain release-controller --ownership "release train status only" --verify "npm view and gh run checks"
async-dispatch runtime plan-code <ledgerId> --objective "Repair release doctor failure" --route domain-owner-chat --domain pipeline --ownership "packages/pipeline/src release doctor tests" --verify "pnpm release:check"
```

Status timeline:

| Time | Watcher lane | Repair lane | Root action | Scheduler |
| --- | --- | --- | --- | --- |
| T0 | active | active | Watcher records external state while repair continues. | `active` |
| T1 | `waiting-external`: npm propagation check due later | active | Record `runtime wait --next-check-at ...`; do not sleep-loop if repair has work. | `active` |
| T2 | waiting | `ready-for-review` | Review repair while watcher waits. | `active` |
| T3 | wait due | done | Root checks npm/CI; clear wait or record next wait. | `active` or `waiting-external` |
| T4 | done | done | Close release train receipts. | `idle` if no more work |

If the watcher is the only remaining lane and the wait is in the future, scheduler should be `waiting-external`. If no wait remains and no work remains, scheduler should be `idle`.

### Example 6: Model/Storage And Console

Initial plan:

```bash
async-dispatch runtime plan-code <ledgerId> --objective "Add ledger state for gates" --route subagent-worktree --worktree "../dispatch-model" --ownership "src/model.js src/store.js test/goal-first.test.js" --verify "pnpm test"
async-dispatch runtime plan-code <ledgerId> --objective "Render gate state in console" --route subagent-worktree --worktree "../dispatch-console" --ownership "src/console-server.js test/goal-first.test.js" --verify "pnpm test"
```

Status timeline:

| Time | Model lane | Console lane | Root action | Scheduler |
| --- | --- | --- | --- | --- |
| T0 | active | `blocked`: waiting for snapshot shape | Model lane establishes the real data shape first. | `active` |
| T1 | `ready-for-review`: snapshot shape exists | blocked | Root gives console lane the accepted shape. | `active` |
| T2 | done | active | Console implements rendering against accepted fields. | `active` |
| T3 | done | `ready-for-review` | Root verifies console does not invent state. | `active` |
| T4 | done | done | Record receipts. | `idle` if no more work |

The console lane can start early only on layout scaffolding that does not assume unavailable state.

### Example 7: Reproduction And Fix

Initial plan:

```bash
async-dispatch runtime plan-code <ledgerId> --objective "Create a minimal repro for duplicate receipt rendering" --route subagent-worktree --worktree "../dispatch-repro" --ownership "test/goal-first.test.js test/fixtures/receipts" --verify "pnpm test"
async-dispatch runtime plan-code <ledgerId> --objective "Fix duplicate receipt rendering" --route subagent-worktree --worktree "../dispatch-fix" --ownership "src/console-server.js" --verify "pnpm test"
```

Status timeline:

| Time | Repro lane | Fix lane | Root action | Scheduler |
| --- | --- | --- | --- | --- |
| T0 | active | `blocked`: waiting for failing repro | Let the repro lane pin down the failure before broad edits. | `active` |
| T1 | `ready-for-review`: failing test exists | blocked | Run the repro and confirm it fails for the claimed reason. | `active` |
| T2 | done | active | Start the fix lane against the accepted repro. | `active` |
| T3 | done | `ready-for-review` | Run the repro against the fix lane and review the diff scope. | `active` |
| T4 | done | done | Record receipts for repro and fix. | `idle` if no more work |

If the repro lane cannot reproduce the issue, root should re-scope the bug before launching implementation.

### Example 8: Port/Adapter And Domain Core

Initial plan:

```bash
async-dispatch runtime plan-code <ledgerId> --objective "Implement release readiness state transitions" --route subagent-worktree --worktree "../dispatch-domain" --ownership "src/model.js test/goal-first.test.js" --verify "pnpm test"
async-dispatch runtime plan-code <ledgerId> --objective "Wire release readiness CLI commands" --route subagent-worktree --worktree "../dispatch-adapter" --ownership "src/cli.js README.md" --verify "async-dispatch help"
```

Status timeline:

| Time | Domain lane | Adapter lane | Root action | Scheduler |
| --- | --- | --- | --- | --- |
| T0 | active | `blocked`: waiting for accepted state shape | Domain lane defines the source-of-truth behavior first. | `active` |
| T1 | `ready-for-review`: tests define states | blocked | Root accepts names, statuses, and invariants. | `active` |
| T2 | done | active | Adapter lane wires commands to the accepted model. | `active` |
| T3 | done | `ready-for-review` | Run CLI smoke plus domain tests. | `active` |
| T4 | done | done | Record receipts and update docs if needed. | `idle` if no more work |

If the adapter lane needs a new state not owned by the domain lane, stop and route the decision to root.

### Example 9: API Producer And Client Consumer

Initial plan:

```bash
async-dispatch runtime plan-code <ledgerId> --objective "Expose stable snapshot fields for workflow nodes" --route subagent-worktree --worktree "../dispatch-producer" --ownership "src/model.js src/store.js api-contract.json" --verify "pnpm run api:check"
async-dispatch runtime plan-code <ledgerId> --objective "Render workflow node status in console" --route subagent-worktree --worktree "../dispatch-consumer" --ownership "src/console-server.js test/goal-first.test.js" --verify "pnpm test"
```

Status timeline:

| Time | Producer lane | Consumer lane | Root action | Scheduler |
| --- | --- | --- | --- | --- |
| T0 | active | `blocked`: waiting for field contract | Producer establishes snapshot fields and contract docs. | `active` |
| T1 | `ready-for-review`: fields documented | blocked | Root confirms compatibility and naming. | `active` |
| T2 | done | active | Consumer renders only accepted fields. | `active` |
| T3 | done | `ready-for-review` | Run API check and console tests together. | `active` |
| T4 | done | done | Record producer and consumer receipts. | `idle` if no more work |

If the consumer invents fields, root sends it back to the producer contract instead of merging local assumptions.

### Example 10: Dependency Upgrade And Compatibility Repair

Initial plan:

```bash
async-dispatch runtime plan-code <ledgerId> --objective "Upgrade parser dependency and capture failing compatibility checks" --route subagent-worktree --worktree "../dispatch-upgrade" --ownership "package.json pnpm-lock.yaml" --verify "pnpm test"
async-dispatch runtime plan-code <ledgerId> --objective "Repair parser compatibility after accepted upgrade" --route subagent-worktree --worktree "../dispatch-compat" --ownership "src/draft-template.js test/goal-first.test.js" --verify "pnpm test"
```

Status timeline:

| Time | Upgrade lane | Repair lane | Root action | Scheduler |
| --- | --- | --- | --- | --- |
| T0 | active | `blocked`: waiting for upgrade result | Upgrade lane isolates dependency and lockfile effects. | `active` |
| T1 | `ready-for-review`: failures captured | blocked | Root decides whether to accept the upgrade. | `active` or `paused-human` |
| T2 | done | active | Repair lane fixes accepted compatibility failures only. | `active` |
| T3 | done | `ready-for-review` | Run full tests and inspect lockfile/source diff together. | `active` |
| T4 | done | done | Record receipts. | `idle` if no more work |

If the upgrade creates unrelated failures, root splits or rejects it before repair expands.

## Stop Conditions

Stop or re-route when:

- a lane needs files outside ownership;
- two lanes need the same files;
- a test failure shows the contract is wrong;
- a repro lane cannot reproduce the bug it is supposed to guard;
- a migration lane lacks a rollback, dry-run, or compatibility check;
- a feature flag lane cannot prove the off path still works;
- an observability lane cannot show the agreed signal;
- a worker repeatedly fails verification;
- a child edits outside its boundary;
- root must make a release, merge, architecture, or completion decision.
