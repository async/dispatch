---
name: dispatch-start
description: Start async-dispatch as the entrypoint for broad Codex root-chat work. Use when a user asks to run async, spawn chats, coordinate multi-repo or multi-slice work, start a Dispatch-managed goal, resume an existing Dispatch board or runtime, or decide whether a raw request should enter planning before implementation.
---

# Dispatch Start

## Overview

Use this as the first Dispatch skill for a raw user goal. It decides whether the
root can work directly, must resume existing Dispatch state, or must enter the
goal -> draft -> board -> runtime planning path before any worker or child-chat
launch.

The important default is: no approved board means start the board phase, not
root-only implementation.

## Start Decision

First inspect local state and the request:

```bash
async-dispatch snapshot
```

Then choose one mode:

- `resume-runtime`: a matching active runtime ledger already exists. Continue
  with `dispatch-root-runtime`.
- `resume-board`: a matching board exists but is not approved or started.
  Present the board/draft for review before `board approve` or `runtime start`.
- `planning-required`: the request is broad, async, multi-repo, multi-slice, or
  asks to spawn chats, but no approved board exists.
- `root-only`: the request is small enough for the root chat, or the user
  explicitly asked for root-only execution.

For `planning-required`, do not edit repos, create worker chats, or commit code.
Start the Dispatch planning phase.

## Missing State Recovery

When Dispatch state is missing, report the recovery path instead of stopping at
"no plan found."

- No matching plan exists: keep using `dispatch-start`; create/refine the goal,
  draft a plan, and give the human the draft path plus approval choices.
- Plan exists but no board exists: keep using `dispatch-start`; ask the human to
  approve or correct the draft, then run `plan ready` and `plan compile`.
- Board exists but no runtime exists: keep using `dispatch-start`; ask the human
  to approve or correct the board, then run `board approve` and `runtime start`.
- Runtime exists: hand off to `dispatch-root-runtime` for nodes, workers,
  receipts, idle/wake, and closeout.
- Code work is ready inside an active runtime: use `dispatch-code-routing`
  before root edits or worker launches.

For a missing plan, the human action must be concrete:

```text
Reply "approve draft" to compile the board, or reply with corrections such as
"split core graph and runtime into separate phases" or "keep this root-only."
```

## Planning Phase

Create a durable goal and gather enough context to draft a real plan:

```bash
async-dispatch goal init --seed "..."
async-dispatch context add <goalId> --note "..."
async-dispatch goal refine <goalId> --statement "..." --purpose "..." --success-proof "..." --constraint "..." --why "..."
```

Draft a human-readable plan before runtime work:

```bash
async-dispatch plan template human-draft --seed "..."
async-dispatch plan draft <goalId> --from <draft.md>
```

Present the draft or board shape to the user for review. Ask for approval or
corrections, not whether planning should happen. Record corrections with:

```bash
async-dispatch plan decision <planId> --note "..."
async-dispatch plan enrich <planId> --note "..."
async-dispatch plan resolve <planId> --decision-id D001 --resolution "..."
```

Only after the human-reviewed draft is ready:

```bash
async-dispatch plan ready <planId> --note "Human reviewed the draft."
async-dispatch plan compile <planId>
```

Do not approve the board on behalf of the user unless their latest message
clearly approved the specific draft/board. After approval:

```bash
async-dispatch board approve <boardId> --note "Human reviewed the board."
async-dispatch runtime start <boardId>
```

## Runtime Handoff

After `runtime start`, switch to `dispatch-root-runtime` for nodes, domain
owners, workers, receipts, idle/wake, and closeout. Use `dispatch-code-routing`
before code edits that might become root work, child chats, domain-owner chats,
or worktree lanes.

Launch workers only from approved runtime state with ownership, verification,
stop conditions, and a root integration point recorded.

## Output Contract

For the first response after this skill triggers, report:

```markdown
## Dispatch Start
Mode: planning-required | resume-runtime | resume-board | root-only
Source state: [matching goal/plan/board/runtime or none]
Goal: [short restatement]
Next phase: [planning, board review, runtime, or root-only]
Root action: [exact command or review step being performed now]
Human review needed: [what the user must approve or correct before workers]
Missing state action: [skill to continue with, exact command family, and concrete human reply]
```

If the mode is `planning-required`, include a concise draft plan or the command
sequence used to create one. If the mode is `root-only`, say why the request is
small enough or quote the explicit root-only instruction.

Never end a missing-plan response with only "review needed." Include the next
agent action, the next human action, and the skill that owns the next phase.
