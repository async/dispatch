import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { renderConsoleHtml } from "../src/console-server.js";
import {
  addPlanDecision,
  addNode,
  addNodeDecisionGate,
  addNodeReceipt,
  addWorkerDomainTask,
  appendReceipt,
  appendRuntimeEvent,
  approveBoard,
  assignWorker,
  blockNodeForHuman,
  clearExternalWait,
  closeWorkerDomain,
  completeWorkerDomainTask,
  compilePlan,
  decideNodeGate,
  draftPlan,
  enrichPlan,
  initGoal,
  loadSnapshot,
  markPlanReady,
  passNode,
  recordExternalWait,
  recordCodeDispatchPlan,
  recordHumanResponse,
  recordRuntimeWake,
  renderNodeTree,
  refineGoal,
  resolvePlanDecision,
  showNode,
  startRuntime,
  updateNodeStatus,
  updateWorkerStatus
} from "../src/model.js";
import { ledgerDir, planDir, readJson, readJsonl, writeJson } from "../src/store.js";

test("a goal can exist without a plan", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, {
    seed: "Coordinate async release alignment",
    idOptions: { suffix: "aaa111", date: new Date("2026-06-14T00:00:00Z") }
  });
  const snapshot = await loadSnapshot(home);

  assert.equal(snapshot.goals.length, 1);
  assert.equal(snapshot.plans.length, 0);
  assert.equal(snapshot.goals[0].id, goal.id);
  assert.equal(snapshot.goals[0].originalSeed, "Coordinate async release alignment");
});

test("a plan cannot compile unless it references a goal", async () => {
  const home = await tempHome();
  const badPlanId = "plan-missing-goal-20260614-bad";
  await writeJson(path.join(planDir(home, badPlanId), "plan.json"), {
    id: badPlanId,
    title: "Bad plan",
    sourceIds: [],
    phases: [],
    sections: []
  });

  await assert.rejects(
    () => compilePlan(home, badPlanId),
    /missing goalId/
  );
});

test("compiled board tasks trace to goal intent and plan source", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, {
    seed: "Align release workflows",
    idOptions: { suffix: "goal01", date: new Date("2026-06-14T00:00:00Z") }
  });
  await refineGoal(home, goal.id, {
    statement: "Make Async release workflows pipeline-owned.",
    successProof: "All target repos pass release checks.",
    why: "After reading the cross-repo draft."
  });
  const draftPath = path.join(home, "draft.md");
  await fs.writeFile(draftPath, "# Draft\n\n## Phase 1: Pipeline foundation G-1 P-2\n\nShip selector.\n");
  const plan = await draftPlan(home, goal.id, {
    from: draftPath,
    idOptions: { suffix: "plan01", date: new Date("2026-06-14T00:00:00Z") }
  });
  await markPlanReady(home, plan.id, { note: "Human approved the traceable draft." });
  const { board } = await compilePlan(home, plan.id, {
    idOptions: { suffix: "board1", date: new Date("2026-06-14T00:00:00Z") }
  });

  assert.equal(board.goalId, goal.id);
  assert.equal(board.planId, plan.id);
  assert.ok(board.tasks.every((task) => task.goalRef.goalId === goal.id));
  assert.ok(board.tasks.every((task) => task.planRefs.some((ref) => ref.planId === plan.id)));
  assert.ok(board.tasks.some((task) => task.planRefs.some((ref) => ref.sourceIds.includes("G-1"))));
  assert.ok(board.tasks.some((task) => task.planRefs.some((ref) => ref.sourceIds.includes("P-2"))));
});

test("human-readable draft creates a pre-runtime plan board without workers", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Align Async repo release and preview workflows" });
  await refineGoal(home, goal.id, {
    statement: "Align target repos around pipeline-owned release and preview workflows.",
    purpose: "Create a human-reviewed plan before opening implementation chats.",
    successProof: "Every plan item is visible on a board before runtime starts.",
    why: "Human-readable draft reviewed before execution."
  });
  const draftPath = path.join(home, "release-preview-alignment-draft.md");
  await fs.writeFile(draftPath, `# Release And PR Preview Alignment Draft

## Reference Map

| ID | Goal |
| --- | --- |
| G-1 | Package lifecycle ownership. |
| G-2 | Release ownership. |

## Phase 0: Baseline And Worktree Audit

Goal: establish the real starting point before any repo edits. References: G-1, G-2.

## Review Questions

1. What should the first generated Pages site contain?
`);
  const plan = await draftPlan(home, goal.id, { from: draftPath });
  await markPlanReady(home, plan.id, { note: "Reviewed for board compilation." });
  const { board } = await compilePlan(home, plan.id);
  const snapshot = await loadSnapshot(home);

  assert.equal(board.status, "planning");
  assert.equal(snapshot.boards.length, 1);
  assert.equal(snapshot.ledgers.length, 0);
  assert.ok(board.tasks.some((task) => task.planRefs.some((ref) => ref.sourceIds.includes("G-1"))));
  assert.ok(board.tasks.every((task) => !["child-chat", "nested-root", "subagent"].includes(task.assignee)));
});

test("draft review decisions attach human corrections to plan sections", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Refine a human draft" });
  const draftPath = path.join(home, "draft.md");
  await fs.writeFile(draftPath, "# Draft\n\n## Missing Or Easy-To-Miss Work\n\nReferences: G-2.\n");
  const plan = await draftPlan(home, goal.id, { from: draftPath });
  const sectionId = plan.sections.find((section) => section.heading === "Missing Or Easy-To-Miss Work").id;
  const { event } = await addPlanDecision(home, plan.id, {
    sectionId,
    sourceId: "G-2",
    note: "GITHUB_TOKEN is automatic in Actions; generated jobs still need permissions.",
    resolution: "Clarified token rules in the draft.",
    status: "resolved"
  });
  const snapshot = await loadSnapshot(home);
  const decisions = snapshot.plans[0].decisions.filter((decision) => decision.type === "plan-decision");

  assert.equal(event.sectionId, sectionId);
  assert.equal(event.decisionId, "D001");
  assert.equal(event.sectionHeading, "Missing Or Easy-To-Miss Work");
  assert.deepEqual(event.sourceIds, ["G-2"]);
  assert.equal(decisions.length, 1);
  assert.match(decisions[0].note, /GITHUB_TOKEN/);
});

test("draft loop supports review comments, enrichment, resolution, and ready gate", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Shape a plan before runtime" });
  const draftPath = path.join(home, "draft.md");
  await fs.writeFile(draftPath, "# Draft\n\n## Cross-Domain Goals\n\n1. Clarify launch scope.\n");
  const plan = await draftPlan(home, goal.id, { from: draftPath });
  const { event } = await addPlanDecision(home, plan.id, {
    note: "Add the missing repo/domain split before board compilation."
  });

  await assert.rejects(
    () => markPlanReady(home, plan.id),
    /open draft review decision/
  );

  await fs.appendFile(draftPath, "\n## `repo-a`\n\n1. Repo-specific goal.\n");
  const enriched = await enrichPlan(home, plan.id, { note: "Added repo split." });
  assert.equal(enriched.enrichmentCount, 1);

  const resolved = await resolvePlanDecision(home, plan.id, {
    decisionId: event.decisionId,
    resolution: "Repo split added to the human draft."
  });
  assert.equal(resolved.event.type, "plan-decision-resolved");

  const ready = await markPlanReady(home, plan.id, { note: "Human says the draft loop is ready." });
  assert.equal(ready.status, "ready-for-board");

  const snapshot = await loadSnapshot(home);
  assert.equal(snapshot.plans[0].openDecisions.length, 0);
  assert.ok(snapshot.plans[0].decisions.some((decision) => decision.type === "plan-enriched"));
  assert.ok(snapshot.plans[0].decisions.some((decision) => decision.type === "plan-decision-resolved"));
});

test("default generated draft starts without reference IDs", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Coordinate multi-repo work" });
  const plan = await draftPlan(home, goal.id, {});
  const draft = await fs.readFile(path.join(planDir(home, plan.id), "draft.md"), "utf8");

  assert.match(draft, /## Cross-Domain Goals/);
  assert.match(draft, /## Execution Order/);
  assert.doesNotMatch(draft, /\bG-1\b/);
  assert.deepEqual(plan.sourceIds, []);
});

test("runtime cannot start until the plan board is approved", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Start only after planning" });
  const plan = await draftPlan(home, goal.id, {});
  await markPlanReady(home, plan.id, { note: "Ready for board." });
  const { board } = await compilePlan(home, plan.id);

  await assert.rejects(
    () => startRuntime(home, board.id),
    /expected approved/
  );

  const approved = await approveBoard(home, board.id, { note: "Human reviewed the pre-runtime board." });
  const { ledger } = await startRuntime(home, approved.id);
  assert.equal(approved.status, "approved");
  assert.equal(ledger.boardId, board.id);
});

test("domain-owning workers stay long-lived until root closes the domain", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Coordinate domain roots" });
  const plan = await draftPlan(home, goal.id, {});
  await markPlanReady(home, plan.id, { note: "Ready for board." });
  const { board } = await compilePlan(home, plan.id);
  await approveBoard(home, board.id, { note: "Ready for runtime." });
  const { ledger } = await startRuntime(home, board.id);
  const assigned = await assignWorker(home, ledger.id, {
    workerType: "nested-root",
    ownsDomain: true,
    domain: "pipeline",
    repoRoot: "/Users/patrickjs/code/async/pipeline",
    thread: "thread-pipeline",
    task: ["Release pipeline", "Refresh consumer adoption plan"]
  });

  assert.equal(assigned.worker.status, "domain-active");
  assert.deepEqual(assigned.ledger.scheduler.waitingSet, [assigned.worker.id]);

  const status = await updateWorkerStatus(home, ledger.id, {
    workerId: assigned.worker.id,
    state: "done",
    message: "Initial release slice is done."
  });
  assert.equal(status.worker.status, "domain-active");
  assert.ok(status.ledger.scheduler.waitingSet.includes(assigned.worker.id));
  assert.ok(!status.ledger.scheduler.doneSet.includes(assigned.worker.id));

  await completeWorkerDomainTask(home, ledger.id, {
    workerId: assigned.worker.id,
    taskId: "DT001",
    summary: "Release slice reviewed.",
    verification: "root receipt"
  });
  await assert.rejects(
    () => closeWorkerDomain(home, ledger.id, { workerId: assigned.worker.id }),
    /open domain task/
  );

  await completeWorkerDomainTask(home, ledger.id, {
    workerId: assigned.worker.id,
    taskId: "DT002",
    summary: "Consumer adoption plan refreshed.",
    verification: "root receipt"
  });
  const closed = await closeWorkerDomain(home, ledger.id, {
    workerId: assigned.worker.id,
    note: "All pipeline domain work is done."
  });

  assert.equal(closed.worker.status, "domain-closed");
  assert.ok(!closed.ledger.scheduler.waitingSet.includes(assigned.worker.id));
  assert.ok(closed.ledger.scheduler.doneSet.includes(assigned.worker.id));
});

test("domain-owning workers can receive new domain tasks after launch", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Keep domain roots alive" });
  const plan = await draftPlan(home, goal.id, {});
  await markPlanReady(home, plan.id, { note: "Ready for board." });
  const { board } = await compilePlan(home, plan.id);
  await approveBoard(home, board.id, { note: "Ready for runtime." });
  const { ledger } = await startRuntime(home, board.id);
  const { worker } = await assignWorker(home, ledger.id, {
    workerType: "nested-root",
    ownsDomain: true,
    domain: "web",
    task: "Audit web release workflow"
  });
  const added = await addWorkerDomainTask(home, ledger.id, {
    workerId: worker.id,
    objective: "Verify web docs and Pages after workflow fixes",
    sourceId: "WEB-3"
  });

  assert.equal(added.task.id, "DT002");
  assert.equal(added.worker.domainTasks.length, 2);
  assert.equal(added.worker.status, "domain-active");
  assert.ok(added.ledger.scheduler.waitingSet.includes(worker.id));
});

test("runtime becomes idle when all domain owners have no open work", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Idle when every domain is parked" });
  const plan = await draftPlan(home, goal.id, {});
  await markPlanReady(home, plan.id, { note: "Ready for board." });
  const { board } = await compilePlan(home, plan.id);
  await approveBoard(home, board.id, { note: "Ready for runtime." });
  const { ledger } = await startRuntime(home, board.id);
  const domains = ["pipeline", "db", "web", "claims", "api-contract"];
  const workers = [];
  for (const domain of domains) {
    const { worker } = await assignWorker(home, ledger.id, {
      workerType: "nested-root",
      ownsDomain: true,
      domain
    });
    workers.push(worker);
  }
  const ledgerPath = path.join(ledgerDir(home, ledger.id), "ledger.json");
  const stored = await readJson(ledgerPath);
  stored.scheduler.callStack = "idle";
  stored.scheduler.readyQueue = [];
  stored.scheduler.statusInbox = [];
  await writeJson(ledgerPath, stored);

  let idle;
  for (const worker of workers) {
    idle = await updateWorkerStatus(home, ledger.id, {
      workerId: worker.id,
      state: "idle"
    });
  }

  assert.equal(idle.ledger.scheduler.polling.status, "idle");
  assert.equal(idle.ledger.scheduler.polling.reason, "No work to poll; waiting for new human input.");
  assert.deepEqual(idle.ledger.workers.map((worker) => worker.status), [
    "domain-idle",
    "domain-idle",
    "domain-idle",
    "domain-idle",
    "domain-idle"
  ]);

  const html = renderConsoleHtml(await loadSnapshot(home));
  assert.match(html, /idle/);
  assert.match(html, /No work to poll; waiting for new human input/);
});

test("one open domain task keeps runtime active instead of idle", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Open work keeps the loop active" });
  const plan = await draftPlan(home, goal.id, {});
  await markPlanReady(home, plan.id, { note: "Ready for board." });
  const { board } = await compilePlan(home, plan.id);
  await approveBoard(home, board.id, { note: "Ready for runtime." });
  const { ledger } = await startRuntime(home, board.id);
  const { worker } = await assignWorker(home, ledger.id, {
    workerType: "nested-root",
    ownsDomain: true,
    domain: "pipeline",
    task: "Release pipeline first"
  });
  const ledgerPath = path.join(ledgerDir(home, ledger.id), "ledger.json");
  const stored = await readJson(ledgerPath);
  stored.scheduler.callStack = "idle";
  stored.scheduler.readyQueue = [];
  stored.scheduler.statusInbox = [];
  await writeJson(ledgerPath, stored);

  const active = await updateWorkerStatus(home, ledger.id, {
    workerId: worker.id,
    state: "done",
    message: "The current slice is done, but the domain task remains open."
  });

  assert.equal(active.worker.status, "domain-active");
  assert.equal(active.ledger.scheduler.polling.status, "active");
});

test("runtime polling pauses when every remaining worker is blocked on a human response", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Pause only when humans are required" });
  const plan = await draftPlan(home, goal.id, {});
  await markPlanReady(home, plan.id, { note: "Ready for board." });
  const { board } = await compilePlan(home, plan.id);
  await approveBoard(home, board.id, { note: "Ready for runtime." });
  const { ledger } = await startRuntime(home, board.id);
  const { worker } = await assignWorker(home, ledger.id, {
    workerType: "nested-root",
    ownsDomain: true,
    domain: "release",
    task: "Choose release fallback policy"
  });
  const ledgerPath = path.join(ledgerDir(home, ledger.id), "ledger.json");
  const stored = await readJson(ledgerPath);
  stored.scheduler.callStack = "idle";
  stored.scheduler.readyQueue = [];
  stored.scheduler.statusInbox = [];
  await writeJson(ledgerPath, stored);

  const blocked = await updateWorkerStatus(home, ledger.id, {
    workerId: worker.id,
    state: "blocked",
    blockedBy: "human",
    message: "Need owner approval for fallback policy.",
    rootActionNeeded: "Wait for human decision."
  });

  assert.equal(blocked.worker.status, "blocked");
  assert.equal(blocked.worker.humanResponseNeeded, true);
  assert.equal(blocked.ledger.scheduler.polling.status, "paused-human");
  assert.equal(blocked.ledger.scheduler.polling.reason, "All active work is waiting on human response.");
  assert.deepEqual(blocked.ledger.scheduler.polling.blockers.map((blocker) => blocker.workerId), [worker.id]);

  const html = renderConsoleHtml(await loadSnapshot(home));
  assert.match(html, /paused-human/);
  assert.match(html, /Human blockers/);
  assert.match(html, /release/);
});

test("runtime wake resumes an idle scheduler with a human-wake event", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Wake after idle" });
  const plan = await draftPlan(home, goal.id, {});
  await markPlanReady(home, plan.id, { note: "Ready for board." });
  const { board } = await compilePlan(home, plan.id);
  await approveBoard(home, board.id, { note: "Ready for runtime." });
  const { ledger } = await startRuntime(home, board.id);
  const { worker } = await assignWorker(home, ledger.id, {
    workerType: "nested-root",
    ownsDomain: true,
    domain: "web"
  });
  const ledgerPath = path.join(ledgerDir(home, ledger.id), "ledger.json");
  const stored = await readJson(ledgerPath);
  stored.scheduler.callStack = "idle";
  stored.scheduler.readyQueue = [];
  stored.scheduler.statusInbox = [];
  await writeJson(ledgerPath, stored);
  const idle = await updateWorkerStatus(home, ledger.id, {
    workerId: worker.id,
    state: "idle"
  });
  assert.equal(idle.ledger.scheduler.polling.status, "idle");

  const woke = await recordRuntimeWake(home, ledger.id, {
    note: "Human asked to dispatch the next docs task."
  });

  assert.equal(woke.ledger.scheduler.polling.status, "active");
  assert.equal(woke.event.type, "human-wake");
  assert.equal(woke.ledger.scheduler.statusInbox.at(-1).type, "human-wake");
  assert.match(woke.ledger.scheduler.polling.reason, /Human input woke an idle runtime/);
});

test("timed external waits do not collapse into idle until cleared", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Sleep only when a timer exists" });
  const plan = await draftPlan(home, goal.id, {});
  await markPlanReady(home, plan.id, { note: "Ready for board." });
  const { board } = await compilePlan(home, plan.id);
  await approveBoard(home, board.id, { note: "Ready for runtime." });
  const { ledger } = await startRuntime(home, board.id);
  const ledgerPath = path.join(ledgerDir(home, ledger.id), "ledger.json");
  const stored = await readJson(ledgerPath);
  stored.scheduler.callStack = "idle";
  stored.scheduler.readyQueue = [];
  stored.scheduler.statusInbox = [];
  await writeJson(ledgerPath, stored);

  const waiting = await recordExternalWait(home, ledger.id, {
    waitId: "EW999",
    reason: "Wait for npm propagation before checking again.",
    nextCheckAt: "2999-01-01T00:00:00.000Z",
    resumeOn: "npm propagation check"
  });

  assert.equal(waiting.ledger.scheduler.polling.status, "waiting-external");
  assert.equal(waiting.ledger.scheduler.polling.nextCheckAt, "2999-01-01T00:00:00.000Z");
  assert.equal(waiting.ledger.scheduler.externalWaits[0].nextCheckAt, "2999-01-01T00:00:00.000Z");

  const html = renderConsoleHtml(await loadSnapshot(home));
  assert.match(html, /waiting-external/);
  assert.match(html, /Wait for npm propagation/);

  const cleared = await clearExternalWait(home, ledger.id, {
    waitId: "EW999",
    note: "Propagation checked."
  });
  assert.equal(cleared.ledger.scheduler.polling.status, "idle");
});

test("root records a code dispatch plan before writing code", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Plan before coding" });
  const plan = await draftPlan(home, goal.id, {});
  await markPlanReady(home, plan.id, { note: "Ready for board." });
  const { board } = await compilePlan(home, plan.id);
  await approveBoard(home, board.id, { note: "Ready for runtime." });
  const { ledger } = await startRuntime(home, board.id);

  const planned = await recordCodeDispatchPlan(home, ledger.id, {
    objective: "Patch a tiny console label.",
    route: "root",
    why: "Small scoped edit with root-owned review."
  });

  assert.equal(planned.plan.id, "DP001");
  assert.equal(planned.plan.route, "root");
  assert.equal(planned.plan.status, "root-owned");
  assert.deepEqual(planned.plan.missing, []);
  assert.equal(planned.event.type, "code-dispatch-planned");
  assert.equal(planned.ledger.scheduler.statusInbox.at(-1).type, "code-dispatch-planned");
  assert.equal(planned.ledger.scheduler.polling.status, "active");
});

test("domain-owner code dispatch plans capture handoff boundaries", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Route code to a domain owner" });
  const plan = await draftPlan(home, goal.id, {});
  await markPlanReady(home, plan.id, { note: "Ready for board." });
  const { board } = await compilePlan(home, plan.id);
  await approveBoard(home, board.id, { note: "Ready for runtime." });
  const { ledger } = await startRuntime(home, board.id);

  const planned = await recordCodeDispatchPlan(home, ledger.id, {
    objective: "Patch release scheduler behavior.",
    route: "domain-owner",
    domain: "pipeline",
    ownership: "packages/pipeline/src",
    verify: "pnpm release:check",
    reasoning: "medium"
  });

  assert.equal(planned.plan.route, "domain-owner-chat");
  assert.equal(planned.plan.domain, "pipeline");
  assert.equal(planned.plan.status, "ready-to-dispatch");
  assert.deepEqual(planned.plan.verification, ["pnpm release:check"]);

  const html = renderConsoleHtml(await loadSnapshot(home));
  assert.match(html, /Code Dispatch Plans/);
  assert.match(html, /domain-owner-chat/);
  assert.match(html, /ready-to-dispatch/);
});

test("subagent worktree plans stay blocked until boundaries are explicit", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Route code to a subagent worktree" });
  const plan = await draftPlan(home, goal.id, {});
  await markPlanReady(home, plan.id, { note: "Ready for board." });
  const { board } = await compilePlan(home, plan.id);
  await approveBoard(home, board.id, { note: "Ready for runtime." });
  const { ledger } = await startRuntime(home, board.id);

  const planned = await recordCodeDispatchPlan(home, ledger.id, {
    objective: "Build a parallel package migration.",
    route: "subagent-worktree"
  });

  assert.equal(planned.plan.status, "needs-boundary");
  assert.deepEqual(planned.plan.missing, ["ownership", "verification", "worktree"]);
  assert.match(planned.event.rootActionNeeded, /Finish dispatch boundaries/);
});

test("recursive direction gates aggregate parent nodes into paused-human", async () => {
  const home = await tempHome();
  const { ledger } = await runtimeFor(home, "Choose direction with recursive nodes");
  await idleRootQueues(home, ledger.id);

  const phase = await addNode(home, ledger.id, {
    kind: "phase",
    title: "Planning",
    objective: "Refine the plan with the human."
  });
  const gated = await addNodeDecisionGate(home, ledger.id, {
    parentId: phase.node.id,
    question: "Which implementation direction should Dispatch take?",
    option: ["Recursive nodes", "Separate tables", "Prompt-only docs"],
    recommended: "1"
  });

  const parent = gated.ledger.nodes.find((node) => node.id === phase.node.id);
  assert.equal(gated.node.kind, "gate");
  assert.equal(gated.node.decisionGate.options.length, 3);
  assert.equal(gated.node.decisionGate.recommendedOptionId, "O1");
  assert.equal(parent.status, "waiting-human");
  assert.equal(gated.ledger.scheduler.polling.status, "paused-human");
  assert.equal(gated.ledger.scheduler.polling.blockers[0].nodeId, phase.node.id);

  const decided = await decideNodeGate(home, ledger.id, {
    nodeId: gated.node.id,
    option: "O1",
    reason: "Use the generic recursive primitive first."
  });
  const decidedParent = decided.ledger.nodes.find((node) => node.id === phase.node.id);
  assert.equal(decided.node.status, "done");
  assert.equal(decided.node.decisionGate.decisionOptionId, "O1");
  assert.equal(decidedParent.status, "gate-ready");
  assert.equal(decided.ledger.scheduler.polling.status, "active");
});

test("node containment prevents incoherent recursive trees", async () => {
  const home = await tempHome();
  const { ledger } = await runtimeFor(home, "Validate node containment");

  await assert.rejects(
    () => addNode(home, ledger.id, { kind: "task", title: "Top-level task" }),
    /Top-level node kind task is not allowed/
  );

  const phase = await addNode(home, ledger.id, { kind: "phase", title: "Discovery" });
  const loop = await addNode(home, ledger.id, {
    parentId: phase.node.id,
    kind: "loop",
    title: "Planning loop"
  });
  const gate = await addNodeDecisionGate(home, ledger.id, {
    parentId: loop.node.id,
    question: "Which scope should the loop use?",
    option: ["Small", "Medium"],
    recommended: "1"
  });

  await assert.rejects(
    () => addNode(home, ledger.id, {
      parentId: gate.node.id,
      kind: "task",
      title: "Invalid child"
    }),
    /cannot be added under gate/
  );

  const tree = await renderNodeTree(home, ledger.id);
  assert.match(tree, /N001 phase/);
  assert.match(tree, /N002 loop/);
  assert.match(tree, /N003 gate/);
});

test("node receipts reference the append-only receipt log", async () => {
  const home = await tempHome();
  const { ledger } = await runtimeFor(home, "Reference node receipts");
  const phase = await addNode(home, ledger.id, {
    kind: "phase",
    title: "Coding",
    requiredReceipt: ["tests", "implementation"]
  });

  const tests = await addNodeReceipt(home, ledger.id, {
    nodeId: phase.node.id,
    requirement: "tests",
    summary: "Red/green tests captured.",
    verification: "npm test -- scheduler"
  });
  assert.equal(tests.node.status, "done");

  const implementation = await addNodeReceipt(home, ledger.id, {
    nodeId: phase.node.id,
    requirement: "implementation",
    summary: "Implementation completed.",
    verification: "npm test"
  });
  const receipts = await readJsonl(path.join(ledgerDir(home, ledger.id), "receipts.jsonl"));

  assert.equal(implementation.node.status, "gate-ready");
  assert.deepEqual(implementation.node.receiptRefs, [
    { receiptId: "R001", requirement: "tests" },
    { receiptId: "R002", requirement: "implementation" }
  ]);
  assert.equal(receipts[0].summary, "Red/green tests captured.");
  assert.equal(receipts[1].nodeId, phase.node.id);

  const passed = await passNode(home, ledger.id, {
    nodeId: phase.node.id,
    receipt: implementation.receipt.receiptId
  });
  assert.equal(passed.node.status, "passed");
});

test("human blockers use a separate contextual schema from direction gates", async () => {
  const home = await tempHome();
  const { ledger } = await runtimeFor(home, "Block with context");
  await idleRootQueues(home, ledger.id);
  const phase = await addNode(home, ledger.id, { kind: "phase", title: "Implementation" });
  const task = await addNode(home, ledger.id, {
    parentId: phase.node.id,
    kind: "task",
    title: "Choose auth scope"
  });

  const blocked = await blockNodeForHuman(home, ledger.id, {
    nodeId: task.node.id,
    blockedThing: "GitHub token permissions",
    whyBlocked: "Need owner decision before writing release workflow permissions.",
    attempted: "Checked generated workflow requirements and package publish path.",
    option: ["Use contents/packages/id-token permissions", "Keep doctor-only workflow"],
    recommended: "1",
    resumeAfterAnswer: "Update the release checklist and continue implementation."
  });

  const parent = blocked.ledger.nodes.find((node) => node.id === phase.node.id);
  assert.equal(blocked.node.status, "waiting-human");
  assert.equal(blocked.node.decisionGate, null);
  assert.equal(blocked.node.humanBlocker.blockedThing, "GitHub token permissions");
  assert.equal(blocked.node.humanBlocker.options.length, 2);
  assert.equal(parent.status, "waiting-human");
  assert.equal(blocked.ledger.scheduler.polling.status, "paused-human");
});

test("node show returns children and joined receipt details", async () => {
  const home = await tempHome();
  const { ledger } = await runtimeFor(home, "Inspect recursive nodes");
  const phase = await addNode(home, ledger.id, { kind: "phase", title: "Review" });
  const lane = await addNode(home, ledger.id, {
    parentId: phase.node.id,
    kind: "lane",
    title: "Quality review"
  });
  await addNodeReceipt(home, ledger.id, {
    nodeId: lane.node.id,
    summary: "Review completed.",
    verification: "node --test"
  });

  const shown = await showNode(home, ledger.id, { nodeId: lane.node.id });
  const tree = await renderNodeTree(home, ledger.id, { nodeId: phase.node.id });

  assert.equal(shown.node.id, lane.node.id);
  assert.equal(shown.receiptDetails[0].summary, "Review completed.");
  assert.match(tree, /N001 phase gate-ready Review/);
  assert.match(tree, /N002 lane done Quality review/);
});

test("human response resumes polling and hands blocked workers back to root", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Resume after human answer" });
  const plan = await draftPlan(home, goal.id, {});
  await markPlanReady(home, plan.id, { note: "Ready for board." });
  const { board } = await compilePlan(home, plan.id);
  await approveBoard(home, board.id, { note: "Ready for runtime." });
  const { ledger } = await startRuntime(home, board.id);
  const { worker } = await assignWorker(home, ledger.id, {
    workerType: "child-chat",
    domain: "docs"
  });
  const ledgerPath = path.join(ledgerDir(home, ledger.id), "ledger.json");
  const stored = await readJson(ledgerPath);
  stored.scheduler.callStack = "idle";
  stored.scheduler.readyQueue = [];
  stored.scheduler.statusInbox = [];
  await writeJson(ledgerPath, stored);
  await updateWorkerStatus(home, ledger.id, {
    workerId: worker.id,
    state: "blocked",
    blockedBy: "human",
    message: "Need human reply before editing docs."
  });

  const resumed = await recordHumanResponse(home, ledger.id, {
    note: "Human approved the docs wording."
  });
  const resumedWorker = resumed.ledger.workers.find((candidate) => candidate.id === worker.id);

  assert.equal(resumed.ledger.scheduler.polling.status, "active");
  assert.equal(resumed.event.type, "human-response");
  assert.deepEqual(resumed.event.workerIds, [worker.id]);
  assert.equal(resumedWorker.status, "needs-root");
  assert.equal(resumedWorker.humanResponseNeeded, false);
  assert.equal(resumedWorker.blockedBy, "");
  assert.match(resumedWorker.rootActionNeeded, /Human approved the docs wording/);
  assert.equal(resumed.ledger.scheduler.statusInbox.at(-1).type, "human-response");
});

test("runtime polling does not pause while root still has call stack work", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Keep polling active with root work" });
  const plan = await draftPlan(home, goal.id, {});
  await markPlanReady(home, plan.id, { note: "Ready for board." });
  const { board } = await compilePlan(home, plan.id);
  await approveBoard(home, board.id, { note: "Ready for runtime." });
  const { ledger } = await startRuntime(home, board.id);
  const { worker } = await assignWorker(home, ledger.id, {
    workerType: "child-chat",
    domain: "ci"
  });
  const ledgerPath = path.join(ledgerDir(home, ledger.id), "ledger.json");
  const stored = await readJson(ledgerPath);
  stored.scheduler.readyQueue = [];
  stored.scheduler.statusInbox = [];
  await writeJson(ledgerPath, stored);

  const blocked = await updateWorkerStatus(home, ledger.id, {
    workerId: worker.id,
    state: "blocked",
    blockedBy: "human",
    message: "Need human reply while root task is still active."
  });

  assert.notEqual(blocked.ledger.scheduler.callStack, "idle");
  assert.equal(blocked.ledger.scheduler.polling.status, "active");
});

test("goal refinement records what changed and why", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Build dispatch" });
  const { decision } = await refineGoal(home, goal.id, {
    statement: "Build a goal-first dispatch kernel.",
    purpose: "Keep root chats and workers coordinated.",
    successProof: "Console shows goal, plan, board, runtime, and receipts.",
    why: "The root chat needs goal refinement before planning."
  });
  const decisions = await readJsonl(path.join(home, "goals", goal.id, "decisions.jsonl"));

  assert.equal(decision.why, "The root chat needs goal refinement before planning.");
  assert.equal(decisions.at(-1).type, "goal-refined");
  assert.equal(decisions.at(-1).after.statement, "Build a goal-first dispatch kernel.");
});

test("console shows goal, plan, board, runtime, receipts, and trace history", async () => {
  const home = await tempHome();
  const goal = await initGoal(home, { seed: "Create a Dispatch Console" });
  await refineGoal(home, goal.id, {
    statement: "Create a local console for root chat coordination.",
    successProof: "The console preserves every translation layer.",
    why: "Greenfield implementation test."
  });
  const plan = await draftPlan(home, goal.id, {});
  await addPlanDecision(home, plan.id, {
    note: "Console should show plan decisions before runtime.",
    status: "resolved"
  });
  await markPlanReady(home, plan.id, { note: "Ready for board." });
  const { board } = await compilePlan(home, plan.id);
  await approveBoard(home, board.id, { note: "Ready for runtime." });
  const { ledger } = await startRuntime(home, board.id);
  await appendRuntimeEvent(home, ledger.id, { message: "Root scheduler started" });
  await appendReceipt(home, ledger.id, {
    taskId: "T001",
    summary: "Validated plan traceability.",
    verification: "node --test"
  });
  const html = renderConsoleHtml(await loadSnapshot(home));

  assert.match(html, /Goal View/);
  assert.match(html, /Original goal seed/);
  assert.match(html, /Refined goal statement/);
  assert.match(html, /Plan View/);
  assert.match(html, /Board View/);
  assert.match(html, /Draft Review/);
  assert.match(html, /Runtime View/);
  assert.match(html, /Workers/);
  assert.match(html, /Receipts/);
  assert.match(html, /Trace View/);
  assert.match(html, /Root scheduler started/);
  assert.match(html, /Console should show plan decisions before runtime/);
  assert.match(html, /Validated plan traceability/);
});

async function runtimeFor(home, seed) {
  const goal = await initGoal(home, { seed });
  const plan = await draftPlan(home, goal.id, {});
  await markPlanReady(home, plan.id, { note: "Ready for board." });
  const { board } = await compilePlan(home, plan.id);
  await approveBoard(home, board.id, { note: "Ready for runtime." });
  return startRuntime(home, board.id);
}

async function idleRootQueues(home, ledgerId) {
  const ledgerPath = path.join(ledgerDir(home, ledgerId), "ledger.json");
  const stored = await readJson(ledgerPath);
  stored.scheduler.callStack = "idle";
  stored.scheduler.readyQueue = [];
  stored.scheduler.statusInbox = [];
  await writeJson(ledgerPath, stored);
}

async function tempHome() {
  return fs.mkdtemp(path.join(os.tmpdir(), "async-dispatch-test-"));
}
