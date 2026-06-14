# Workflow Improvement Loop

Use this reference when closing out Dispatch runtime work or improving the
Dispatch workflow from receipts, blockers, waits, reroutes, or failed
verification. The purpose is to make Dispatch better after real runs.

## Core Loop

Every significant Dispatch run should end with a brief improvement pass:

```text
run -> receipts -> closeout audit -> lesson -> follow-up -> validation -> skill/runtime promotion
```

This is not a user-triggered topic branch. It is part of the root runtime's
operating loop.

In the runtime ledger, lessons can be recorded as `lesson` nodes under the
current phase or closeout node. The lesson node stores structure and links to
receipt evidence; the receipt log stores the durable proof.

## Lesson Shape

Capture lessons as small records:

```text
trigger
observed
rule
evidence
followUp
status: observed | candidate-rule | applied-to-repo | validated | promoted-to-skill
```

- `trigger`: what situation exposed the issue.
- `observed`: what actually happened.
- `rule`: the improved Dispatch behavior for next time.
- `evidence`: receipt, test, console state, blocker, wait, or review that proves
  the lesson is real.
- `followUp`: the runtime, doc, test, or skill change needed.

## What To Look For

During closeout, scan for:

- root doing code work that should have been routed to a domain owner or worker;
- a worker blocked globally when only one task was blocked;
- a proposed `sleep(x)` that should have been `idle`, `paused-human`, or
  `waiting-external`;
- missing receipts for done, blocked, or escalated work;
- repeated failed verification without a judge/root decision;
- docs or examples promising behavior not represented in the ledger;
- gates, release train fields, or wait states that were implied by chat but not
  modeled;
- recursive nodes whose parent/child status no longer matches the actual work;
- final completion claimed without mapping receipts back to the success proof.

## ADR-Style Decisions

Use ADR-style records only when a lesson becomes a durable design decision.
Good candidates:

- scheduler state semantics such as `idle` versus `paused-human`;
- gate, fanout, release train, WAL, or wait-state models;
- skill promotion policy;
- root/domain/worker ownership rules;
- repeated operational failures with concrete evidence.

ADR-style records should explain why the rule exists. They should not become a
second scheduler, queue, or board.

## Promotion Policy

Do not update installed skills from a single raw observation. Prefer this path:

1. Record the lesson in the bundled workflow guidance.
2. Add or update a runtime test when the lesson maps to behavior.
3. Use the source skill on a real workflow.
4. Install or publish updated skills only after validation and explicit approval.

If a lesson changes actual runtime semantics, update the CLI/model/tests before
updating skill guidance that depends on it.
