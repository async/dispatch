# Dispatch Control Discipline

Use this reference when deciding how Dispatch should plan, board, run, watch,
and close broad root-chat work. Dispatch owns its own control model: a
CLI-managed board, runtime ledger, dependency graph, receipts, and console UI.

## Core Rules

- Start with observable success proof before runtime work starts.
- Treat the Dispatch ledger as the source of truth; chat summaries never
  override board, worker, node, wait, or receipt state.
- Keep root responsible for routing, task activation, integration, release, and
  completion judgment.
- Keep scouts and judges read-only unless they are explicitly promoted into a
  bounded worker lane.
- Launch write work only after ownership, verification, stop conditions, and the
  root integration point are recorded.
- Require compact receipts for done, blocked, escalated, and externally waiting
  work.
- Block the exact item that is blocked; continue safe adjacent work when the
  board proves ownership is independent.
- Complete only after receipts map back to the original goal and success proof.

## Dispatch Board

The Dispatch board is not a generated artifact checked into the repo. It is the
live projection of CLI-managed state:

- goal: original seed, refined statement, constraints, and success proof;
- plan: human-reviewed draft, source IDs, sections, and review decisions;
- board: approved tasks before runtime starts;
- ledger: scheduler state, runtime inbox, waits, workers, dispatch plans, nodes,
  receipts, and events;
- console: a watchable UI that discovers every absolute root runtime and the
  work depending on it.

An absolute root runtime is a ledger that is not listed as a `childLedger` of
another worker. The console should show every absolute root and then collect the
work under it: board tasks, recursive nodes, code-dispatch plans, workers,
domain tasks, external waits, inbox events, receipts, child ledgers, and linked
threads.

## Watch Behavior

The UI should help root decide whether more polling is useful:

- `active`: runnable work, review, due wait, gate transition, or inbox event
  exists.
- `paused-human`: remaining actionable work needs a known human answer.
- `waiting-external`: the only legitimate dependency is a timed or external
  event.
- `idle`: no useful polling remains; wait for `runtime wake`.

When a root chat wants to sleep, inspect the board first. If there is another
ready dependency, dispatch or review that work. If the only dependency is timed,
record `runtime wait`. If there is nothing actionable, let the runtime become
`idle`.

## Ownership Boundaries

Before dispatching a write lane, record:

- the owner: root, child chat, domain owner, or worktree worker;
- the owned files, domain, thread, worktree, node, or repo;
- the verification command;
- the stop condition for broader files, ambiguous behavior, or repeated failure;
- the receipt shape for success, blocker, and escalation;
- the root integration point.

Keep one active writer per owned scope. Dispatch can still run parallel lanes
when ownership is disjoint and root has an explicit integration point.

## Design Checklist

Before adding or changing runtime behavior, check:

- What success proof will the final audit verify?
- Which ledger object is the source of truth?
- Which absolute root runtime should own the work?
- Which dependencies should the console discover under that root?
- Is this read-only scouting/judgment, root integration, or bounded worker work?
- What ownership, verification, and stop conditions are required?
- What receipt proves done, blocked, waiting, or escalated?
- Should the scheduler be `active`, `paused-human`, `waiting-external`, or
  `idle`?
- What board or console view would make the next root action obvious?
