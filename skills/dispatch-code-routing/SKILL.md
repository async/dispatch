---
name: dispatch-code-routing
description: Route code work before editing in async-dispatch. Use when root chat is about to write code and should quickly decide whether the work is root-owned, a same-turn subagent check, a subagent worktree, a durable child chat, or an existing domain-owner chat, then record the decision with runtime plan-code.
---

# Dispatch Code Routing

## Overview

Before root writes code, record a small dispatch plan. The goal is not ceremony; it is to prevent root from doing broad work that should be isolated, delegated, or handed to a long-lived domain owner.

Conceptually, code routing turns possible code work into queued lanes with state:
`needs-boundary`, `ready-to-dispatch`, `active`, `ready-for-review`, `blocked`, `done`, or idle/waiting runtime states.

For a broader catalog of async opportunities and status timelines, read [references/async-work-patterns.md](references/async-work-patterns.md) when a task has more than one viable lane or when planning multiple workers against one codebase.

## Routing Table

Choose one route:

- `root`: small edit, unclear design, overlapping files, final review/integration, architecture, merge, push, release, or completion decision.
- `subagent`: short same-turn read-only scout/judge check.
- `subagent-worktree`: write-capable parallel work with exact ownership, verification, and a separate worktree.
- `domain-owner-chat`: durable work that belongs with an existing long-lived domain owner.
- `child-chat`: durable bounded work needing a receipt, but not a domain owner.

Default to `root` or one worker. Use 2-4 parallel writers only when ownership boundaries are independent, non-overlapping, and verifiable before root integration.

## Parallel Test And Code Lanes

Split tests and implementation when they can progress side by side:

- Test lane: own test files, fixtures, acceptance cases, and expected failure shape.
- Code lane: own implementation files only.
- Root: own the interface decision, cross-lane review, and final integration.

This is useful when the test can come online before the implementation is complete. As soon as the test lane has a runnable red test or acceptance command, root can run it against the code lane's current branch/worktree and feed the result back into the runtime.

Record both lanes separately:

```bash
async-dispatch runtime plan-code <ledgerId> --objective "Add failing tests for scheduler idle/wake" --route subagent-worktree --worktree "../dispatch-tests" --ownership "test/goal-first.test.js" --verify "npm test"
async-dispatch runtime plan-code <ledgerId> --objective "Implement scheduler idle/wake support" --route subagent-worktree --worktree "../dispatch-code" --ownership "src/model.js src/cli.js src/console-server.js" --verify "npm test"
```

Use async polling:

- When the test lane reports a runnable command, run it against the code lane if the code lane has reached the touched interface.
- If the test fails for expected missing implementation, keep the code lane active.
- If the test fails because the test assumptions are wrong, route back to root for interface review.
- If both lanes are idle or waiting, let Dispatch enter `idle`, `paused-human`, or `waiting-external` instead of sleep-looping.

See [references/async-work-patterns.md](references/async-work-patterns.md) for additional lane patterns and status examples such as docs/runtime, contract/implementation, scout/implementation, and benchmark/optimization.

## Record The Plan

Use:

```bash
async-dispatch runtime plan-code <ledgerId> --objective "..." --route <route> --ownership "..." --verify "..."
```

For domain-owned work:

```bash
async-dispatch runtime plan-code <ledgerId> --node-id N003 --objective "..." --route domain-owner-chat --domain pipeline --ownership "packages/pipeline/src" --verify "pnpm release:check"
```

For worktree work:

```bash
async-dispatch runtime plan-code <ledgerId> --node-id N003 --objective "..." --route subagent-worktree --worktree "../worktree-name" --ownership "src/foo.js test/foo.test.js" --verify "npm test"
```

## Boundary Requirements

Delegated routes are not ready until they have:

- ownership or allowed files;
- verification command;
- stop condition when the worker would need broader files or decisions;
- domain or worker ID for `domain-owner-chat`;
- worktree path for `subagent-worktree`.

If boundaries are missing, Dispatch marks the plan `needs-boundary`. Fill the missing boundary before editing or launching a worker.

## Root Responsibilities

- Root owns final integration, verification, and completion judgment.
- Root reviews receipts before accepting delegated work.
- Root re-routes if overlap, ambiguity, repeated verification failure, or outside-ownership edits appear.
- Root should use `runtime wake` before planning new work after an idle state.
- Root should link code dispatch plans to the current recursive node with `--node-id` when a phase, loop, task, or lane is active.
