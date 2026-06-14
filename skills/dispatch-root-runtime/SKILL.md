---
name: dispatch-root-runtime
description: Coordinate goal-first root-chat work through async-dispatch. Use when a Codex root chat needs to turn a raw goal into a human-reviewed draft, reference-map enrichment, board approval, runtime ledger, long-lived domain owners, receipts, idle/wake handling, or human-blocked polling using the Dispatch CLI.
---

# Dispatch Root Runtime

## Overview

Use Dispatch as the durable coordination kernel for broad root-chat work. Keep the root chat responsible for planning, routing, review, integration, and final judgment; use workers only through ledgered runtime state.

Conceptually, treat Dispatch as a small state-machine and queue runtime:

- state machines track root runtime, domain owners, workers, code lanes, and waits;
- recursive nodes track phases, loops, checkpoints, milestones, tasks, lanes, gates, and lessons as workflow structure;
- queues/inboxes track ready work, status events, blockers, and due waits;
- receipts/events prove what happened before root integrates or completes work;
- closeout lessons improve the workflow after real receipts, blockers, reroutes,
  waits, or verification failures.

For detailed workflow learning rules, use [references/workflow-improvement-loop.md](references/workflow-improvement-loop.md). For Dispatch-native board, watch, ownership, and receipt discipline, use [references/dispatch-control-discipline.md](references/dispatch-control-discipline.md).

## Workflow

1. Start from the real goal.
   - Run `async-dispatch goal init --seed "..."`
   - Add discovered facts with `async-dispatch context add <goalId> --note "..."`
   - Refine the charter with `goal refine`, including success proof and constraints.

2. Keep the human draft loop explicit.
   - Generate a plain draft with `plan template human-draft`.
   - Record every human correction with `plan decision`.
   - Add reference IDs only after the draft shape is accepted, using `plan template reference-map` plus `plan enrich`.
   - Resolve comments with `plan resolve`.
   - Do not compile until `plan ready` succeeds.

3. Compile only reviewed plans.
   - Run `plan compile <planId>`.
   - Run `board approve <boardId>` only after the human has reviewed the board.
   - Start runtime with `runtime start <boardId>`.
   - Use the console to watch every absolute root runtime and its dependent work.

4. Assign long-lived domain owners for durable repo/domain work.
   - Use `worker assign <ledgerId> --owns-domain true --domain <name> --worker-type nested-root`.
   - Add follow-up work with `worker task`.
   - Treat `done` as a slice result, not domain closure.
   - Use `worker status --state idle` when the domain has no open work but should stay available.
   - Use `worker close-domain` only for final archival/finalization.

5. Use recursive nodes for workflow structure.
   - Use `node add` to create phases, loops, checkpoints, milestones, tasks, lanes, gates, and lessons.
   - Treat nodes as the workflow overlay only; workers, dispatch plans, waits, and JSONL receipts remain execution records linked by IDs.
   - Run async child work inside the active parent node, then require receipts or a gate decision before passing the parent.
   - Use `node gate` for direction choices with 2-3 options and a recommended default.
   - Use `node block-human` for blocked work that needs rich human context before progress can resume.

6. Poll only while useful.
   - `active`: runnable work exists; root should dispatch, review, or poll.
   - `paused-human`: work exists but a known human answer is required; record the answer with `runtime human-response`.
   - `waiting-external`: a real timer or external event is pending; do not hide this as an untracked sleep.
   - `idle`: no useful polling remains; wait for new human input, then run `runtime wake`.

7. Close the loop with lessons learned.
   - During phase and final audits, inspect receipts, blockers, waits, reroutes, failed verification, and attempted sleeps.
   - Capture reusable workflow lessons as `trigger`, `observed`, `rule`, `evidence`, `followUp`, and `status`.
   - Turn validated lessons into runtime tests, docs, or bundled skill guidance before installed skill updates.

## Guardrails

- Do not launch worker chats before board approval.
- Do not let child chats own merge, push, release, architecture direction, or final completion judgment.
- Do not force parallelism; one worker is the default until the board proves independent, non-overlapping slices.
- Do not duplicate receipt bodies inside nodes; nodes store receipt references and the JSONL receipt stream stores proof.
- Keep receipts in the ledger before considering a domain or goal complete.
