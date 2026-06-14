# @async/dispatch

Installable local coordination CLI for goal-first async chat work.

Dispatch keeps the coordination engine outside individual skills:

```text
Goal Seed -> Context Discovery -> Refined Goal Charter -> Human Draft -> Review Loop -> Reference Map Enrichment -> Board -> Runtime Ledger -> Workers/Receipts
```

The CLI owns IDs, storage, validation, plan compilation, and the local console.
Bundled Codex skills stay thin and call into Dispatch instead of duplicating
runtime state in prompts.

## Install

Dispatch is distributed as the public npm package `@async/dispatch`. Install the
CLI first, then install the bundled skills that teach Codex how to use that CLI
for async root chats, domain chats, workers, receipts, idle/wake handling, and
code-routing decisions. A normal user should not need a source checkout.

Requirements:

- Node.js 24 or newer

Install the CLI from the public npm registry:

```bash
pnpm add --global @async/dispatch
async-dispatch help
```

The same package also works with npm directly:

```bash
npm install --global @async/dispatch
async-dispatch help
```

Use `corepack` only if you want pnpm to manage global installs on a fresh
machine:

```bash
corepack enable
pnpm add --global @async/dispatch
async-dispatch help
```

For an unpublished local build or release candidate, install the checkout as a
global tarball instead of running source files directly:

```bash
corepack enable
pnpm install
PACK_DIR="$(mktemp -d)"
pnpm pack --pack-destination "$PACK_DIR"
pnpm add --global "$PACK_DIR"/async-dispatch-*.tgz
async-dispatch help
```

Install the bundled Codex skills:

```bash
async-dispatch skills install
async-dispatch skills status
```

After this, start a fresh Codex session so the newly installed Dispatch skills
are discoverable. The installed skills call `async-dispatch`; they should not
duplicate runtime state in prompts or local skill files.

By default that writes to `~/.codex/skills`. Installed Dispatch-managed skills
include metadata with the package version and source hash so `skills status` can
report `missing`, `current`, `stale`, `modified`, or `unmanaged`.

Existing skill folders are skipped unless they are missing or you explicitly ask
for replacement. To update Dispatch-managed skills from a newer package, use:

```bash
async-dispatch skills install --force
```

Unmanaged folders are not replaced by `--force`; use `--replace-unmanaged` only
after deciding the existing folder should be backed up and replaced.

Use `--skill` to install one bundled skill:

```bash
async-dispatch skills install --skill dispatch-root-runtime
```

## Development From Checkout

Source development still works from a checkout. Use this when changing Dispatch
itself, validating a release, or editing the bundled skills before publishing an
updated package.

Development requires pnpm 10.20 or newer.

```bash
git clone <dispatch-repo-url> dispatch
cd dispatch
corepack enable
pnpm install
pnpm link --global
async-dispatch help
async-dispatch skills install
async-dispatch skills status
```

Full local verification dogfoods adjacent Async helper packages. The expected
development layout is:

```text
async/
  api-contract/
  claims/
  dispatch/
  pipeline/
```

Build or verify the helper repos first if their `dist/` folders are missing,
then run Dispatch verification:

```bash
cd ../pipeline
pnpm install
pnpm run build

cd ../api-contract
pnpm install
pnpm run build

cd ../claims
pnpm install
pnpm run build

cd ../dispatch
pnpm run pipeline:verify
```

If you only need the Dispatch CLI and do not have the helper repos yet, use the
standalone gate:

```bash
pnpm test
```

`pipeline:verify` creates ignored `.async/` run and cache artifacts. Runtime
ledger state does not live there; it defaults to `~/.async/dispatch`.

Patch releases are published by GitHub Actions through the Dispatch pipeline:
the release workflow calls `pnpm run pipeline:publish`, and the pipeline job
delegates npm publication to `async-pipeline publish npm --package .`.

## Quick Start

Use a temporary home for demos so you do not touch your real Dispatch ledger:

```bash
export ASYNC_DISPATCH_HOME="$(mktemp -d)"
dispatch() { async-dispatch "$@"; }
```

Create and start a small runtime:

```bash
GOAL=$(dispatch goal init --seed "Coordinate a local release" | awk '/goalId:/ {print $2}')
PLAN=$(dispatch plan draft "$GOAL" | awk '/planId:/ {print $2}')
dispatch plan ready "$PLAN" --note "ready"
BOARD=$(dispatch plan compile "$PLAN" | awk '/boardId:/ {print $2}')
dispatch board approve "$BOARD" --note "approved"
LEDGER=$(dispatch runtime start "$BOARD" | awk '/ledgerId:/ {print $2}')
dispatch node add "$LEDGER" --kind phase --title "Discovery"
dispatch node tree "$LEDGER"
```

Open the local console:

```bash
dispatch console --port 8787
```

The console renders a Work Discovery board. It finds every absolute root runtime
and shows the board tasks, workers, domain tasks, nodes, dispatch plans, waits,
inbox events, receipts, child ledgers, and linked threads that depend on that root. A
watcher can read the same projection from `/api/work`.

## Conceptual Model

Dispatch is a small local state-machine and queue runtime for Codex work.

- State machines describe what each durable thing is doing: the root runtime,
  domain owners, workers, code-dispatch lanes, external waits, and future gates.
- Queues and inboxes describe what needs attention next: ready work, status
  events, blocked work, and due waits.
- Receipts and events describe what happened and why root can safely move
  forward.

The goal is not a distributed job system. The goal is to keep root-chat
coordination explicit: runnable work stays `active`, known human blockers become
`paused-human`, real timers become `waiting-external`, and no useful work
becomes `idle`.

## Dispatch Control Discipline

Dispatch makes root-chat coordination first-class:

- Start with an oracle: record the observable success proof before runtime work
  starts, then keep checking receipts against it.
- Treat state as truth: the Dispatch ledger, not chat prose, decides what is
  active, blocked, done, waiting, or idle.
- Use role-shaped work: scout and judge work should be read-only, worker work
  should be bounded, and root owns PM decisions.
- Bound every write lane: record ownership or allowed files, verification, and
  stop conditions before dispatching a worker.
- Require receipts for done, blocked, and escalated work.
- Block the exact task, not the whole runtime, when safe adjacent work can
  continue.
- Finish with an audit that maps current receipts back to the original goal and
  success proof.

Dispatch's source of truth is its CLI-managed board and runtime ledger, not a
generated repo artifact. The console is the live UI: it discovers each absolute
root runtime, then shows the board tasks, workers, domain tasks, nodes,
dispatch plans, waits, inbox events, receipts, child ledgers, and linked threads
that depend on that root. Keep one active writer per owned scope; run parallel
lanes only when ownership is disjoint and root has an integration point.

## Workflow Improvement Loop

Dispatch should learn from its own runs. The root closeout should inspect
receipts, blockers, reroutes, failed verification, external waits, idle
transitions, and any place the agent wanted to add an untracked sleep. If that
teaches a reusable rule, capture it as a lesson:

```text
trigger
observed
rule
evidence
followUp
status
```

ADR-style records are useful when the lesson becomes a durable design decision:
why a scheduler state exists, why a gate is required, why a release train table
is the source of truth, or why a skill workflow changed. The live Dispatch
ledger still decides current state; lessons and ADRs explain how the workflow
should improve next time.

Lessons should move through a small lifecycle:

```text
observed -> candidate-rule -> applied-to-repo -> validated -> promoted-to-skill
```

Do not promote every one-off annoyance. Promote lessons that have concrete
evidence, prevent repeated failure, or clarify root/domain/worker boundaries.

## Recursive Runtime Nodes

V1 nodes are the workflow-structure overlay for recursive phases, loops,
checkpoints, milestones, tasks, lanes, gates, and lessons. They do not replace
execution records. Workers, code dispatch plans, external waits, and JSONL
receipts remain the execution source of truth and link back with `nodeId` or
receipt IDs.

Containment is intentionally narrow for v1:

```text
root -> phase
phase -> loop | checkpoint | milestone | task | lane | gate | lesson
loop -> checkpoint | gate | task | lane
checkpoint | milestone -> task | lane | gate
task | lane | gate | lesson -> leaf
```

Parent status is derived from children unless the parent is already terminal.
Runnable or reviewable children make the parent `active`; all actionable
children waiting on humans make it `waiting-human`; only external waits make it
`waiting-external`; complete children plus required receipt references make it
`gate-ready`; `node pass` makes it `passed`.

Human direction and human blockers use separate shapes. Direction gates store a
question, 2-3 options, a recommended option, and the final decision. Human
blockers store the blocked thing, why it is blocked, what was attempted, options
when useful, the recommended path, and what resumes after the answer.

## Storage

By default Dispatch stores data under:

```text
$HOME/.async/dispatch
```

For tests or demos, set:

```bash
ASYNC_DISPATCH_HOME=/tmp/async-dispatch-demo
```

Use persistent storage for real work and a temporary `ASYNC_DISPATCH_HOME` for
tests, demos, and README smoke runs. Do not put runtime ledger state in the repo.

`.async/` is reserved for Async Pipeline run/cache artifacts. `.async-dispatch/`
is only an ignored legacy/reserved local scratch name; current Dispatch runtime
state is `~/.async/dispatch` unless `ASYNC_DISPATCH_HOME` is set.

## Codex Setup

Codex should normally use the installed Dispatch skills plus the installed
`async-dispatch` command. The checkout is only required when the task is to
change Dispatch itself.

Checklist for a new Codex thread:

1. Confirm the CLI and installed skills:

   ```bash
   async-dispatch help
   async-dispatch skills status
   ```

2. Install or refresh the bundled skills if they are missing or stale:

   ```bash
   async-dispatch skills install
   ```

   Use `async-dispatch skills install --force` only when intentionally updating
   Dispatch-managed installed skill copies from the current package.

3. Choose storage:
   - Real ongoing work: leave `ASYNC_DISPATCH_HOME` unset so state goes to
     `~/.async/dispatch`.
   - Demo or test work: set `ASYNC_DISPATCH_HOME="$(mktemp -d)"`.

4. Smoke-test the selected storage:

   ```bash
   async-dispatch snapshot
   ```

5. In a fresh Codex session, use the installed skills when their triggers match:
   - `$dispatch-root-runtime` for broad root-chat coordination.
   - `$dispatch-code-routing` before code edits that might split into lanes,
     worktrees, child chats, or domain-owner chats.
   - `$dispatch-skill-evolution` when changing the bundled Dispatch skills or
     promoting workflow lessons into them.

6. For a new user goal, move through the hard boundaries:
   - `goal init`
   - `context add` for discovered facts
   - `plan draft` or `plan template human-draft`
   - review loop with `plan decision`, `plan enrich`, and `plan resolve`
   - `plan ready`
   - `plan compile`
   - `board approve`
   - `runtime start`

7. Once a runtime exists, treat the ledger as source of truth:
   - Use `node add`, `node gate`, `node tree`, and `node show` for recursive
     phases, loops, checkpoints, tasks, lanes, gates, and lessons.
   - Before writing code, record routing with `runtime plan-code`.
   - Keep worker/domain state current with `worker status`, `worker task`,
     receipts, and `worker close-domain`.
   - Use `runtime wait` only for a real timer or external event.
   - Use `runtime human-response` only for a known blocker that was waiting on
     a specific human answer.
   - Use `runtime wake` when the runtime is idle and the human says something
     new.

8. Before claiming the repo is healthy, run the strongest available local gate
   from the Dispatch checkout:

   ```bash
   pnpm run pipeline:verify
   ```

   If the helper repos or their `dist/` folders are not present, run the narrow
   smoke path instead:

   ```bash
   async-dispatch help
   async-dispatch snapshot
   ```

Codex should not invent sleeps or private scratch state. If there is runnable
work, dispatch it. If the only valid action is a timer or external event, record
an external wait. If nothing is actionable, let the scheduler become `idle` and
wait for `runtime wake`.

## Bundled Codex Skills

The `skills/` directory is part of the package. These skills ship with
`@async/dispatch` and are installed into Codex with
`async-dispatch skills install`.

- `dispatch-root-runtime`: goal, draft, board, runtime, worker, receipt, idle,
  and wake coordination.
- `dispatch-code-routing`: quick code-routing decisions before edits, including
  root work, scouts, worktrees, child chats, and domain-owner chats.
- `dispatch-skill-evolution`: evolving bundled Dispatch skills before publishing
  or installing updated copies.

The skills should stay thin. They tell Codex when to call `async-dispatch`; they
should not duplicate ledger state in long prompts.

During Dispatch development, edit bundled skills in `skills/<skill-name>/`, then
validate the source copy:

```bash
pnpm run skills:check
```

After validation, install them for local Codex use:

```bash
async-dispatch skills install --force
async-dispatch skills status
```

Publishing the package and installing skills are separate actions. A fresh Codex
session only sees the workflow after the skills are installed into the Codex
skills directory.

## Commands

```bash
async-dispatch goal init --seed "Align async repo release workflows"
async-dispatch context add <goalId> --note "Found six target repos"
async-dispatch goal refine <goalId> --statement "..." --success-proof "..." --why "After repo scan"
async-dispatch plan template human-draft --seed "Align async repo release workflows" > draft.md
async-dispatch plan draft <goalId> --from release-preview-alignment-draft.md
async-dispatch plan decision <planId> --section-id S018 --note "GITHUB_TOKEN is automatic in Actions"
async-dispatch plan template reference-map --seed "Align async repo release workflows"
async-dispatch plan enrich <planId> --note "Added reference map and phase IDs"
async-dispatch plan resolve <planId> --decision-id D001 --resolution "Clarified token rules in the draft"
async-dispatch plan ready <planId> --note "Human says the draft loop is ready"
async-dispatch plan compile <planId>
async-dispatch board approve <boardId> --note "Human reviewed the plan board"
async-dispatch runtime start <boardId>
async-dispatch worker assign <ledgerId> --domain "pipeline" --owns-domain true --worker-type nested-root --task "Release pipeline first"
async-dispatch worker task <ledgerId> --worker-id W001 --objective "Refresh consumer repos after pipeline release"
async-dispatch worker status <ledgerId> --worker-id W001 --state ready-for-review --message "Initial slice is ready"
async-dispatch worker status <ledgerId> --worker-id W001 --state blocked --blocked-by human --message "Need release owner decision"
async-dispatch runtime human-response <ledgerId> --note "Owner approved option A"
async-dispatch worker status <ledgerId> --worker-id W001 --state idle
async-dispatch runtime wake <ledgerId> --note "Human asked for the next dispatch"
async-dispatch runtime plan-code <ledgerId> --objective "Patch release scheduler" --route domain-owner-chat --domain pipeline --ownership "packages/pipeline/src" --verify "pnpm release:check"
async-dispatch runtime wait <ledgerId> --next-check-at "2026-06-14T18:00:00.000Z" --reason "Wait for npm propagation"
async-dispatch runtime clear-wait <ledgerId> --wait-id EW001 --note "Propagation checked"
async-dispatch node add <ledgerId> --kind phase --title "Discovery" --objective "Map the repo before implementation"
async-dispatch node add <ledgerId> --parent-id N001 --kind loop --title "Planning loop"
async-dispatch node gate <ledgerId> --parent-id N002 --question "Which direction?" --option "Recursive nodes" --option "Separate tables" --recommended 1
async-dispatch node block-human <ledgerId> --node-id N003 --blocked-thing "Release permissions" --why-blocked "Need owner decision" --attempted "Checked workflow requirements" --option "Use trusted publishing" --option "Keep doctor-only" --recommended 1 --resume-after-answer "Update release checklist"
async-dispatch node receipt <ledgerId> --node-id N001 --requirement research --summary "Repo map complete" --verification "reviewed files"
async-dispatch node pass <ledgerId> --node-id N001 --receipt R001
async-dispatch node tree <ledgerId>
async-dispatch node show <ledgerId> --node-id N001
async-dispatch worker complete-task <ledgerId> --worker-id W001 --task-id DT001 --summary "Reviewed" --verification "root receipt"
async-dispatch worker close-domain <ledgerId> --worker-id W001 --note "Domain backlog drained"
async-dispatch skills list
async-dispatch skills status
async-dispatch skills check
async-dispatch skills install --force
async-dispatch console
```

`plan compile` creates a draft/plan board only. It does not create chats, code
work, worker threads, or runtime ledgers. Use `runtime start` only after the plan
board is approved.

## Replacement Flow

The v0 target is to replace the manual workflow:

```text
raw goal -> human-readable draft -> review comments -> reference-map enrichment -> pre-runtime board -> root runtime
```

Use `plan decision` for every human correction or review comment that changes
the draft. Decisions are append-only and may reference a section such as `S018`.
After the draft is edited, use `plan enrich` to refresh the parsed structure and
`plan resolve` to close the original review comment with a resolution event.

The initial human draft intentionally starts without stable IDs. Add IDs such as
`G-2` or `DB-4` during the reference-map enrichment pass, after the human agrees
the broad shape is right.

Use `plan ready` as the hard boundary before compiling a board. `plan compile`
refuses to run while the draft is not ready or while open review decisions
remain.

Use `board approve` as the hard boundary before chats, code work, threads, or
runtime ledgers. `runtime start` refuses to run until the board is approved.

## Domain Owners

Dispatch distinguishes one-shot child chats from domain owners.

A worker with `ownsDomain: true` is long-lived. It stays in the runtime waiting
set while it has open work. When the domain has no open task, no blocker, and no
root action needed, it can sit at `domain-idle` without being closed. A domain
owner reporting `done` only means the current slice is done; it does not close
the domain while open domain tasks remain.

Use this for repo/domain roots such as `pipeline`, `db`, or `web`, where the
child needs to keep context across multiple related tasks. Use a short
`child-chat` without `ownsDomain` only for bounded one-off work.

This is the rule that keeps the root chat useful after the first child run: the
root polls long-lived domain owners only while there is actual work, adds domain
tasks when new work appears, and uses `worker close-domain` only for final
archival/finalization.

## Event-Driven Idle

Dispatch stops runtime polling when the root has no active call stack item, no
ready queue items, no actionable inbox events, no active domain tasks, and no
external wait that is due or pending. The ledger records:

```text
scheduler.polling.status: "idle"
```

That means there is nothing useful to poll. The root should not loop or invent a
sleep. When the human says something new, record it as a wake event:

```bash
async-dispatch runtime wake <ledgerId> --note "Human asked for the next dispatch"
```

That appends a `human-wake` event to the status inbox, sets polling back to
`active`, and lets the root decide what to dispatch next.

If the only valid action is to wait for a real timer or external event, record
that explicitly instead of hiding it in a root-chat sleep:

```bash
async-dispatch runtime wait <ledgerId> --next-check-at "2026-06-14T18:00:00.000Z" --reason "Wait for npm propagation"
```

The console shows this as `waiting-external` with the next check time. Clear the
wait after checking the external condition:

```bash
async-dispatch runtime clear-wait <ledgerId> --wait-id EW001 --note "Propagation checked"
```

## Code Dispatch Planning

Before the root chat starts writing code, it should quickly route the work. The
runtime can record that decision so the root does not accidentally do broad work
that belongs in a bounded worker, worktree, or long-lived domain chat.

```bash
async-dispatch runtime plan-code <ledgerId> --objective "Patch release scheduler" --route domain-owner-chat --domain pipeline --ownership "packages/pipeline/src" --verify "pnpm release:check"
```

Supported routes:

- `root`: small edits, unclear design, overlapping files, review/integration,
  architecture, merge, push, release, or completion decisions.
- `subagent`: short same-turn read-only scout/judge checks.
- `subagent-worktree`: write-capable parallel work with exact ownership, a
  worktree, and verification.
- `domain-owner-chat`: durable work that belongs with an existing domain owner.
- `child-chat`: durable bounded work that needs its own receipt but does not
  belong to a long-lived domain owner.

Delegated routes are marked `needs-boundary` until they include ownership and
verification. `domain-owner-chat` also needs a domain or worker ID, and
`subagent-worktree` needs a worktree target. Recording a plan appends a
`code-dispatch-planned` event to the status inbox so the root can review the
route before dispatching or editing.

Tests and implementation are a good parallel case when their ownership is clean.
Record a test lane and a code lane separately:

```bash
async-dispatch runtime plan-code <ledgerId> --objective "Add failing tests for scheduler idle/wake" --route subagent-worktree --worktree "../dispatch-tests" --ownership "test/goal-first.test.js" --verify "pnpm test"
async-dispatch runtime plan-code <ledgerId> --objective "Implement scheduler idle/wake support" --route subagent-worktree --worktree "../dispatch-code" --ownership "src/model.js src/cli.js src/console-server.js" --verify "pnpm test"
```

When the test lane has a runnable red test, root can run it against the code
lane as soon as the code lane reaches the relevant interface. If the test fails
because implementation is missing, keep the code lane active. If the test fails
because the contract is wrong, route back to root for an interface decision. If
both lanes have nothing runnable, let the scheduler become `idle`,
`paused-human`, or `waiting-external` instead of adding an untracked sleep loop.

## Human-Blocked Polling

Dispatch pauses runtime polling when the root has no active call stack item, no
ready queue items, no non-human actionable inbox events, and every waiting
worker is blocked on a human response.

Workers can signal this with:

```bash
async-dispatch worker status <ledgerId> --worker-id W001 --state blocked --blocked-by human --message "Need owner approval"
```

The ledger then records `scheduler.polling.status: "paused-human"` with a
blocker list. The console shows the pause reason so the root chat can stop
wasting turns polling child chats that cannot progress.

When the human replies, record that response:

```bash
async-dispatch runtime human-response <ledgerId> --note "Approved option A"
```

That resumes polling, clears the human-block marker on affected workers, marks
them `needs-root`, and puts a `human-response` event into the status inbox for
the root to process.

## Development

```bash
pnpm test
pnpm run claims:check
pnpm run api:check
pnpm run pipeline:verify
```
