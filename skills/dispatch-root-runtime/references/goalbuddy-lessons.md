# GoalBuddy Lessons For Dispatch

Use this reference when applying GoalBuddy ideas to Dispatch runtime design.
Borrow the control discipline, not the exact file layout.

## Mapping

| GoalBuddy concept | Dispatch equivalent | Dispatch rule |
| --- | --- | --- |
| Goal oracle | `goal.refined.successProof`, future oracle fields, final audit receipts | Define the observable success proof before runtime work starts. |
| `state.yaml` as board truth | CLI-managed board and runtime ledger | Chat summaries never override ledger state. |
| Charter | refined goal plus human-reviewed plan draft | Preserve original request, non-goals, constraints, and likely misfire. |
| Scout | `subagent` or read-only domain task | Scout lanes produce evidence only; they do not write implementation files. |
| Judge | root-owned review or read-only judge task | Use for ambiguity, risk boundaries, verification failures, and final completion. |
| Worker | bounded child/domain/worktree lane | Worker work needs ownership, verification, and stop conditions before launch. |
| PM | root chat | Root owns routing, task activation, integration, release, and completion judgment. |
| Receipt | runtime event and worker/domain receipt | Done, blocked, and escalated work must leave compact durable proof. |
| Blocked task | worker blocker, `paused-human`, or `waiting-external` | Block the exact item; continue safe adjacent work when available. |
| Final Judge audit | root final audit | Do not complete until receipts prove the original success proof. |

## Dispatch Adaptations

Dispatch is intentionally more async than GoalBuddy. Keep GoalBuddy's
one-active-write discipline inside each owned scope, but allow multiple lanes
when root has proved that files, domains, or worktrees are disjoint.

Use these boundaries before dispatching a write lane:

- ownership or allowed files;
- verification command;
- stop condition for broader files, ambiguous behavior, or repeated failures;
- root-owned integration point;
- receipt shape for success, blocker, and escalation.

When a lane reports `blocked`, decide whether the scheduler should be:

- `active` when another lane, inbox event, gate transition, or root decision can
  move;
- `paused-human` when all remaining actionable work needs a known human answer;
- `waiting-external` when the only real dependency is a timed or external event;
- `idle` when no useful work remains and no wait is pending.

## Things Not To Copy

- Do not make `docs/goals/<slug>` the Dispatch source of truth.
- Do not add generated visual board artifacts to the repo unless explicitly
  requested.
- Do not treat one active task as a global Dispatch limit; treat it as the
  default write limit per owned scope.
- Do not store arbitrary manual gate booleans. If Dispatch adds explicit gates,
  gate state should be justified by receipts, due waits, human decisions, or
  known worker status.
- Do not stop at planning when a safe bounded worker task exists and the user
  asked for implementation.

## Design Checklist

Before adding or changing runtime behavior, check:

- What is the oracle or success proof?
- Which ledger object is the source of truth?
- Is this scout, judge, worker, or root/PM work?
- What ownership, verification, and stop conditions are required?
- What receipt proves done, blocked, or escalated?
- Should this be `active`, `paused-human`, `waiting-external`, or `idle`?
- What final audit would prove the original user outcome is complete?
