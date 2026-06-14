import fs from "node:fs/promises";
import path from "node:path";
import { renderHumanDraftTemplate } from "./draft-template.js";
import { makeId, slugify } from "./ids.js";
import {
  appendJsonl,
  boardDir,
  ensureStore,
  goalDir,
  ledgerDir,
  planDir,
  readJson,
  readJsonl,
  readRegistry,
  upsertRegistryEntry,
  writeJson
} from "./store.js";

const PLAN_ID_PATTERN = /\b([A-Z]{1,5}-\d+)\b/g;
const NODE_KINDS = ["phase", "loop", "checkpoint", "milestone", "task", "lane", "gate", "lesson"];
const NODE_STATUSES = [
  "planned",
  "active",
  "waiting-human",
  "waiting-external",
  "blocked",
  "gate-ready",
  "passed",
  "failed",
  "done",
  "idle",
  "closed"
];
const NODE_TERMINAL_STATUSES = ["passed", "failed", "closed"];
const NODE_DONE_STATUSES = ["done", "passed", "closed"];
const NODE_CONTAINMENT = {
  root: ["phase"],
  phase: ["loop", "checkpoint", "milestone", "task", "lane", "gate", "lesson"],
  loop: ["checkpoint", "gate", "task", "lane"],
  checkpoint: ["task", "lane", "gate"],
  milestone: ["task", "lane", "gate"],
  task: [],
  lane: [],
  gate: [],
  lesson: []
};

export async function initGoal(home, { seed, idOptions = {} }) {
  if (!seed) throw new Error("goal init requires --seed");
  await ensureStore(home);
  const now = new Date().toISOString();
  const id = makeId("goal", seed, idOptions);
  const goal = {
    id,
    originalSeed: seed,
    refined: {
      statement: "",
      purpose: "",
      successProof: "",
      constraints: [],
      nonGoals: [],
      openQuestions: [],
      contextGathered: [],
      confidence: "low",
      phase: "goal-seed"
    },
    status: "seeded",
    createdAt: now,
    updatedAt: now
  };
  await writeJson(path.join(goalDir(home, id), "goal.json"), goal);
  await appendJsonl(path.join(goalDir(home, id), "decisions.jsonl"), {
    type: "goal-created",
    goalId: id,
    seed,
    at: now
  });
  await upsertRegistryEntry(home, "goals", {
    id,
    path: path.join(goalDir(home, id), "goal.json"),
    status: goal.status,
    updatedAt: now
  });
  return goal;
}

export async function readGoal(home, goalId) {
  return readJson(path.join(goalDir(home, goalId), "goal.json"));
}

export async function addContext(home, goalId, { note, source = "operator" }) {
  if (!note) throw new Error("context add requires --note");
  const goal = await readGoal(home, goalId);
  const event = {
    type: "context",
    goalId,
    source,
    note,
    at: new Date().toISOString()
  };
  await appendJsonl(path.join(goalDir(home, goalId), "context.jsonl"), event);
  goal.refined.contextGathered.push(note);
  goal.updatedAt = event.at;
  await writeJson(path.join(goalDir(home, goalId), "goal.json"), goal);
  await upsertRegistryEntry(home, "goals", {
    id: goal.id,
    path: path.join(goalDir(home, goal.id), "goal.json"),
    status: goal.status,
    updatedAt: goal.updatedAt
  });
  return event;
}

export async function refineGoal(home, goalId, fields) {
  const goal = await readGoal(home, goalId);
  const before = structuredClone(goal.refined);
  const refined = goal.refined;

  assignIfPresent(refined, "statement", fields.statement);
  assignIfPresent(refined, "purpose", fields.purpose);
  assignIfPresent(refined, "successProof", fields.successProof);
  assignIfPresent(refined, "confidence", fields.confidence);
  assignIfPresent(refined, "phase", fields.phase);
  appendList(refined.constraints, fields.constraint);
  appendList(refined.nonGoals, fields.nonGoal);
  appendList(refined.openQuestions, fields.openQuestion);

  goal.status = "refined";
  goal.updatedAt = new Date().toISOString();
  await writeJson(path.join(goalDir(home, goalId), "goal.json"), goal);

  const decision = {
    type: "goal-refined",
    goalId,
    before,
    after: goal.refined,
    why: fields.why || "Goal refined after context discovery.",
    at: goal.updatedAt
  };
  await appendJsonl(path.join(goalDir(home, goalId), "decisions.jsonl"), decision);
  await upsertRegistryEntry(home, "goals", {
    id: goal.id,
    path: path.join(goalDir(home, goal.id), "goal.json"),
    status: goal.status,
    updatedAt: goal.updatedAt
  });
  return { goal, decision };
}

export async function draftPlan(home, goalId, { from, title, idOptions = {} } = {}) {
  const goal = await readGoal(home, goalId);
  const sourceText = from
    ? await fs.readFile(from, "utf8")
    : defaultPlanDraft(goal);
  const parsed = parseMarkdownPlan(sourceText);
  const planTitle = title || parsed.title || `${goal.originalSeed} plan`;
  const id = makeId("plan", planTitle, idOptions);
  const now = new Date().toISOString();
  const dir = planDir(home, id);
  const draftPath = path.join(dir, "draft.md");
  const plan = {
    id,
    goalId,
    title: planTitle,
    status: "draft",
    source: {
      type: from ? "markdown-file" : "generated-skeleton",
      path: from ? path.resolve(from) : draftPath
    },
    sourceIds: parsed.sourceIds,
    sections: parsed.sections,
    phases: parsed.phases,
    workstreams: parsed.workstreams,
    refinedGoalSnapshot: goal.refined,
    createdAt: now,
    updatedAt: now
  };
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(draftPath, sourceText);
  await writeJson(path.join(dir, "plan.json"), plan);
  await upsertRegistryEntry(home, "plans", {
    id,
    goalId,
    path: path.join(dir, "plan.json"),
    status: plan.status,
    updatedAt: now
  });
  return plan;
}

export async function reviewPlan(home, planId, { decision = "approved", note = "" } = {}) {
  const plan = await readPlan(home, planId);
  const event = {
    type: "plan-reviewed",
    planId,
    goalId: plan.goalId,
    decision,
    note,
    at: new Date().toISOString()
  };
  plan.status = decision;
  plan.updatedAt = event.at;
  await writeJson(path.join(planDir(home, planId), "plan.json"), plan);
  await appendJsonl(path.join(planDir(home, planId), "decisions.jsonl"), event);
  await upsertRegistryEntry(home, "plans", {
    id: plan.id,
    goalId: plan.goalId,
    path: path.join(planDir(home, plan.id), "plan.json"),
    status: plan.status,
    updatedAt: plan.updatedAt
  });
  return { plan, event };
}

export async function readPlan(home, planId) {
  return readJson(path.join(planDir(home, planId), "plan.json"));
}

export async function enrichPlan(home, planId, { note = "" } = {}) {
  const plan = await readPlan(home, planId);
  const draftPath = path.join(planDir(home, planId), "draft.md");
  const sourcePath = plan.source?.type === "markdown-file" ? plan.source.path : draftPath;
  const sourceText = await fs.readFile(sourcePath, "utf8");
  const parsed = parseMarkdownPlan(sourceText);
  const decisions = await readJsonl(path.join(planDir(home, planId), "decisions.jsonl"));
  const now = new Date().toISOString();
  plan.title = parsed.title || plan.title;
  plan.status = getOpenPlanDecisions(decisions).length > 0 ? "reviewing" : "draft-loop";
  plan.sourceIds = parsed.sourceIds;
  plan.sections = parsed.sections;
  plan.phases = parsed.phases;
  plan.workstreams = parsed.workstreams;
  plan.enrichmentCount = (plan.enrichmentCount || 0) + 1;
  plan.updatedAt = now;
  await fs.writeFile(draftPath, sourceText);
  await writeJson(path.join(planDir(home, planId), "plan.json"), plan);
  await appendJsonl(path.join(planDir(home, planId), "decisions.jsonl"), {
    type: "plan-enriched",
    planId,
    goalId: plan.goalId,
    sourceIds: plan.sourceIds,
    sections: plan.sections.length,
    phases: plan.phases.length,
    note,
    at: now
  });
  await upsertRegistryEntry(home, "plans", {
    id: plan.id,
    goalId: plan.goalId,
    path: path.join(planDir(home, plan.id), "plan.json"),
    status: plan.status,
    updatedAt: plan.updatedAt
  });
  return plan;
}

export async function addPlanDecision(home, planId, fields) {
  if (!fields.note) throw new Error("plan decision requires --note");
  const plan = await readPlan(home, planId);
  const decisions = await readJsonl(path.join(planDir(home, planId), "decisions.jsonl"));
  const existingDecisionCount = decisions.filter((decision) => decision.type === "plan-decision").length;
  const event = {
    type: "plan-decision",
    decisionId: fields.decisionId || `D${String(existingDecisionCount + 1).padStart(3, "0")}`,
    planId,
    goalId: plan.goalId,
    kind: fields.kind || "review-note",
    status: fields.status || "open",
    sectionId: fields.sectionId || "",
    sectionHeading: findSectionHeading(plan, fields.sectionId),
    sourceIds: normalizeList(fields.sourceId),
    note: fields.note,
    resolution: fields.resolution || "",
    at: new Date().toISOString()
  };
  plan.status = "reviewing";
  plan.reviewDecisionCount = (plan.reviewDecisionCount || 0) + 1;
  plan.updatedAt = event.at;
  await writeJson(path.join(planDir(home, planId), "plan.json"), plan);
  await appendJsonl(path.join(planDir(home, planId), "decisions.jsonl"), event);
  await upsertRegistryEntry(home, "plans", {
    id: plan.id,
    goalId: plan.goalId,
    path: path.join(planDir(home, plan.id), "plan.json"),
    status: plan.status,
    updatedAt: plan.updatedAt
  });
  return { plan, event };
}

export async function resolvePlanDecision(home, planId, fields) {
  if (!fields.decisionId) throw new Error("plan resolve requires --decision-id");
  if (!fields.resolution) throw new Error("plan resolve requires --resolution");
  const plan = await readPlan(home, planId);
  const decisions = await readJsonl(path.join(planDir(home, planId), "decisions.jsonl"));
  const target = decisions.find((decision) =>
    decision.type === "plan-decision" && decision.decisionId === fields.decisionId
  );
  if (!target) throw new Error(`Cannot resolve unknown plan decision ${fields.decisionId}`);
  const event = {
    type: "plan-decision-resolved",
    decisionId: fields.decisionId,
    planId,
    goalId: plan.goalId,
    resolution: fields.resolution,
    note: fields.note || "",
    at: new Date().toISOString()
  };
  const nextDecisions = [...decisions, event];
  plan.status = getOpenPlanDecisions(nextDecisions).length > 0 ? "reviewing" : "draft-loop";
  plan.updatedAt = event.at;
  await writeJson(path.join(planDir(home, planId), "plan.json"), plan);
  await appendJsonl(path.join(planDir(home, planId), "decisions.jsonl"), event);
  await upsertRegistryEntry(home, "plans", {
    id: plan.id,
    goalId: plan.goalId,
    path: path.join(planDir(home, plan.id), "plan.json"),
    status: plan.status,
    updatedAt: plan.updatedAt
  });
  return { plan, event };
}

export async function markPlanReady(home, planId, { note = "" } = {}) {
  const plan = await readPlan(home, planId);
  const decisions = await readJsonl(path.join(planDir(home, planId), "decisions.jsonl"));
  const openDecisions = getOpenPlanDecisions(decisions);
  if (openDecisions.length > 0) {
    throw new Error(`Cannot mark plan ${planId} ready: ${openDecisions.length} open draft review decision(s) remain`);
  }
  const now = new Date().toISOString();
  plan.status = "ready-for-board";
  plan.readyAt = now;
  plan.readyNote = note;
  plan.updatedAt = now;
  await writeJson(path.join(planDir(home, planId), "plan.json"), plan);
  await appendJsonl(path.join(planDir(home, planId), "decisions.jsonl"), {
    type: "plan-ready",
    planId,
    goalId: plan.goalId,
    note,
    at: now
  });
  await upsertRegistryEntry(home, "plans", {
    id: plan.id,
    goalId: plan.goalId,
    path: path.join(planDir(home, plan.id), "plan.json"),
    status: plan.status,
    updatedAt: plan.updatedAt
  });
  return plan;
}

export async function compilePlan(home, planId, { idOptions = {} } = {}) {
  const plan = await readPlan(home, planId);
  if (!plan.goalId) {
    throw new Error(`Cannot compile plan ${planId}: missing goalId`);
  }
  if (plan.status !== "ready-for-board") {
    throw new Error(`Cannot compile plan ${planId}: plan status is ${plan.status}, expected ready-for-board`);
  }
  const goal = await readGoal(home, plan.goalId);
  const now = new Date().toISOString();
  const boardId = makeId("board", plan.title, idOptions);
  const tasks = buildTasks(goal, plan);
  const board = {
    id: boardId,
    goalId: goal.id,
    planId: plan.id,
    status: "planning",
    activeTask: tasks[0]?.id ?? null,
    tasks,
    createdAt: now,
    updatedAt: now
  };
  await writeJson(path.join(boardDir(home, boardId), "board.json"), board);
  await appendJsonl(path.join(boardDir(home, boardId), "events.jsonl"), {
    type: "plan-board-created",
    goalId: goal.id,
    planId: plan.id,
    boardId,
    at: now
  });
  await writeCompileReport(home, goal, plan, board);
  await upsertRegistryEntry(home, "boards", {
    id: boardId,
    goalId: goal.id,
    planId: plan.id,
    path: path.join(boardDir(home, boardId), "board.json"),
    status: board.status,
    updatedAt: now
  });
  return { board };
}

export async function startRuntime(home, boardId, { idOptions = {} } = {}) {
  const board = await readBoard(home, boardId);
  if (board.status !== "approved") {
    throw new Error(`Cannot start runtime for board ${boardId}: board status is ${board.status}, expected approved`);
  }
  const goal = await readGoal(home, board.goalId);
  const plan = await readPlan(home, board.planId);
  const now = new Date().toISOString();
  const ledgerId = makeId("ledger", plan.title, idOptions);
  const ledger = {
    id: ledgerId,
    goalId: goal.id,
    planId: plan.id,
    boardId,
    status: "active",
    scheduler: {
      callStack: board.activeTask || "idle",
      readyQueue: board.tasks.filter((task) => task.id !== board.activeTask).map((task) => task.id),
      waitingSet: [],
      statusInbox: [],
      doneSet: [],
      externalWaits: [],
      polling: {
        status: "active",
        reason: "",
        blockers: [],
        updatedAt: now
      }
    },
    nodes: [],
    dispatchPlans: [],
    workers: [],
    createdAt: now,
    updatedAt: now
  };
  board.status = "runtime-ready";
  board.runtimeLedgerId = ledgerId;
  board.updatedAt = now;
  await writeJson(path.join(boardDir(home, boardId), "board.json"), board);
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), {
    type: "runtime-started",
    goalId: goal.id,
    planId: plan.id,
    boardId,
    ledgerId,
    at: now
  });
  await upsertRegistryEntry(home, "boards", {
    id: board.id,
    goalId: goal.id,
    planId: plan.id,
    ledgerId,
    path: path.join(boardDir(home, board.id), "board.json"),
    status: board.status,
    updatedAt: now
  });
  await upsertRegistryEntry(home, "ledgers", {
    id: ledgerId,
    goalId: goal.id,
    planId: plan.id,
    boardId,
    path: path.join(ledgerDir(home, ledgerId), "ledger.json"),
    status: ledger.status,
    updatedAt: now
  });
  return { board, ledger };
}

export async function readLedger(home, ledgerId) {
  return readJson(path.join(ledgerDir(home, ledgerId), "ledger.json"));
}

export async function assignWorker(home, ledgerId, fields) {
  const ledger = await readLedger(home, ledgerId);
  const now = new Date().toISOString();
  const ownsDomain = toBoolean(fields.ownsDomain);
  const workerId = fields.workerId || `W${String((ledger.workers || []).length + 1).padStart(3, "0")}`;
  const domainTasks = normalizeList(fields.task).map((objective, index) => ({
    id: `DT${String(index + 1).padStart(3, "0")}`,
    objective,
    status: "queued",
    createdAt: now,
    updatedAt: now
  }));
  const worker = {
    id: workerId,
    workerType: fields.workerType || (ownsDomain ? "nested-root" : "child-chat"),
    domain: fields.domain || "",
    repoRoot: fields.repoRoot || "",
    nodeId: fields.nodeId || "",
    ownsDomain,
    parentLedger: ledgerId,
    childLedger: fields.childLedger || "",
    thread: fields.thread || "",
    status: ownsDomain ? "domain-active" : "waiting",
    domainStatus: ownsDomain ? "active" : "none",
    domainTasks,
    rootActionNeeded: fields.rootActionNeeded || "",
    blockedBy: "",
    blockedReason: "",
    humanResponseNeeded: false,
    lastStatus: "",
    createdAt: now,
    updatedAt: now
  };
  ledger.workers = [...(ledger.workers || []), worker];
  ledger.scheduler = normalizeScheduler(ledger.scheduler);
  ledger.scheduler.waitingSet = unique([...ledger.scheduler.waitingSet, worker.id]);
  ledger.updatedAt = now;
  refreshPollingState(ledger, now);
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  const event = {
    type: "worker-assigned",
    ledgerId,
    workerId: worker.id,
    workerType: worker.workerType,
    domain: worker.domain,
    ownsDomain: worker.ownsDomain,
    rootActionNeeded: worker.rootActionNeeded,
    at: now
  };
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), event);
  await touchLedgerRegistry(home, ledger);
  return { ledger, worker, event };
}

export async function addWorkerDomainTask(home, ledgerId, fields) {
  if (!fields.workerId) throw new Error("worker task requires --worker-id");
  if (!fields.objective) throw new Error("worker task requires --objective");
  const ledger = await readLedger(home, ledgerId);
  const worker = findWorker(ledger, fields.workerId);
  if (!worker.ownsDomain) throw new Error(`Worker ${worker.id} does not own a domain`);
  const now = new Date().toISOString();
  const task = {
    id: fields.taskId || `DT${String((worker.domainTasks || []).length + 1).padStart(3, "0")}`,
    objective: fields.objective,
    status: "queued",
    nodeId: fields.nodeId || "",
    sourceIds: normalizeList(fields.sourceId),
    createdAt: now,
    updatedAt: now
  };
  worker.domainTasks = [...(worker.domainTasks || []), task];
  worker.status = "domain-active";
  worker.domainStatus = "active";
  worker.blockedBy = "";
  worker.blockedReason = "";
  worker.humanResponseNeeded = false;
  worker.updatedAt = now;
  ledger.scheduler = normalizeScheduler(ledger.scheduler);
  ledger.scheduler.waitingSet = unique([...ledger.scheduler.waitingSet, worker.id]);
  ledger.scheduler.doneSet = ledger.scheduler.doneSet.filter((id) => id !== worker.id);
  ledger.updatedAt = now;
  refreshPollingState(ledger, now);
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  const event = {
    type: "domain-task-added",
    ledgerId,
    workerId: worker.id,
    taskId: task.id,
    domain: worker.domain,
    objective: task.objective,
    at: now
  };
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), event);
  await touchLedgerRegistry(home, ledger);
  return { ledger, worker, task, event };
}

export async function updateWorkerStatus(home, ledgerId, fields) {
  if (!fields.workerId) throw new Error("worker status requires --worker-id");
  if (!fields.state && !fields.status) throw new Error("worker status requires --state");
  const ledger = await readLedger(home, ledgerId);
  const worker = findWorker(ledger, fields.workerId);
  const now = new Date().toISOString();
  const state = fields.state || fields.status;
  const openTasks = openDomainTasks(worker);
  worker.lastStatus = state;
  worker.lastMessage = fields.message || "";
  worker.rootActionNeeded = state === "idle" ? "" : fields.rootActionNeeded || worker.rootActionNeeded || "";
  if (state === "blocked") {
    worker.blockedBy = fields.blockedBy || worker.blockedBy || "";
    worker.blockedReason = fields.blockedReason || fields.message || worker.blockedReason || "";
    worker.humanResponseNeeded = isHumanBlock(fields, worker);
  } else if (state !== "needs-root") {
    worker.blockedBy = "";
    worker.blockedReason = "";
    worker.humanResponseNeeded = false;
  }
  worker.updatedAt = now;
  ledger.scheduler = normalizeScheduler(ledger.scheduler);

  if (worker.ownsDomain) {
    if (state === "idle") {
      if (openTasks.length > 0) {
        throw new Error(`Cannot mark domain ${worker.domain || worker.id} idle: ${openTasks.length} open domain task(s) remain`);
      }
      worker.status = "domain-idle";
      worker.domainStatus = "idle";
    } else if (state === "done" && openTasks.length === 0 && !worker.rootActionNeeded && !worker.blockedBy) {
      worker.status = "domain-idle";
      worker.domainStatus = "idle";
    } else if (state === "ready-for-review" && openTasks.length === 0) {
      worker.status = "domain-ready-for-close";
      worker.domainStatus = "ready-for-close";
      worker.rootActionNeeded = worker.rootActionNeeded || "Review domain receipt and decide whether to close or keep the domain idle.";
    } else if (state === "blocked" || state === "needs-root" || state === "ready-for-review") {
      worker.status = state;
    } else {
      worker.status = "domain-active";
    }
    ledger.scheduler.waitingSet = unique([...ledger.scheduler.waitingSet, worker.id]);
    ledger.scheduler.doneSet = ledger.scheduler.doneSet.filter((id) => id !== worker.id);
  } else {
    worker.status = state;
    if (state === "done") {
      ledger.scheduler.waitingSet = ledger.scheduler.waitingSet.filter((id) => id !== worker.id);
      ledger.scheduler.doneSet = unique([...ledger.scheduler.doneSet, worker.id]);
    } else {
      ledger.scheduler.waitingSet = unique([...ledger.scheduler.waitingSet, worker.id]);
    }
  }

  const event = {
    type: "worker-status",
    ledgerId,
    workerId: worker.id,
    state,
    status: worker.status,
    domain: worker.domain,
    ownsDomain: worker.ownsDomain,
    openDomainTasks: openTasks.length,
    blockedBy: worker.blockedBy,
    humanResponseNeeded: worker.humanResponseNeeded,
    message: fields.message || "",
    rootActionNeeded: worker.rootActionNeeded,
    at: now
  };
  if (["needs-root", "blocked", "ready-for-review"].includes(state) || worker.rootActionNeeded) {
    ledger.scheduler.statusInbox = [...ledger.scheduler.statusInbox, event];
  }
  ledger.updatedAt = now;
  refreshPollingState(ledger, now);
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), event);
  await touchLedgerRegistry(home, ledger);
  return { ledger, worker, event };
}

export async function completeWorkerDomainTask(home, ledgerId, fields) {
  if (!fields.workerId) throw new Error("worker complete-task requires --worker-id");
  if (!fields.taskId) throw new Error("worker complete-task requires --task-id");
  const ledger = await readLedger(home, ledgerId);
  const worker = findWorker(ledger, fields.workerId);
  if (!worker.ownsDomain) throw new Error(`Worker ${worker.id} does not own a domain`);
  const task = (worker.domainTasks || []).find((candidate) => candidate.id === fields.taskId);
  if (!task) throw new Error(`Unknown domain task ${fields.taskId}`);
  const now = new Date().toISOString();
  task.status = "done";
  task.summary = fields.summary || "";
  task.verification = fields.verification || "";
  task.completedAt = now;
  task.updatedAt = now;
  const openTasks = openDomainTasks(worker);
  if (openTasks.length === 0) {
    worker.status = "domain-idle";
    worker.domainStatus = "idle";
    worker.rootActionNeeded = "";
  } else {
    worker.status = "domain-active";
    worker.domainStatus = "active";
  }
  worker.blockedBy = "";
  worker.blockedReason = "";
  worker.humanResponseNeeded = false;
  worker.updatedAt = now;
  ledger.scheduler = normalizeScheduler(ledger.scheduler);
  ledger.scheduler.waitingSet = unique([...ledger.scheduler.waitingSet, worker.id]);
  ledger.updatedAt = now;
  refreshPollingState(ledger, now);
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  const event = {
    type: "domain-task-completed",
    ledgerId,
    workerId: worker.id,
    taskId: task.id,
    domain: worker.domain,
    openDomainTasks: openTasks.length,
    rootActionNeeded: worker.rootActionNeeded,
    at: now
  };
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), event);
  const receiptId = await nextReceiptId(home, ledgerId);
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "receipts.jsonl"), {
    type: "domain-task-receipt",
    receiptId,
    ledgerId,
    workerId: worker.id,
    taskId: task.id,
    nodeId: task.nodeId || worker.nodeId || "",
    summary: task.summary,
    verification: task.verification,
    at: now
  });
  await touchLedgerRegistry(home, ledger);
  return { ledger, worker, task, event };
}

export async function closeWorkerDomain(home, ledgerId, fields) {
  if (!fields.workerId) throw new Error("worker close-domain requires --worker-id");
  const ledger = await readLedger(home, ledgerId);
  const worker = findWorker(ledger, fields.workerId);
  if (!worker.ownsDomain) throw new Error(`Worker ${worker.id} does not own a domain`);
  const openTasks = openDomainTasks(worker);
  if (openTasks.length > 0) {
    throw new Error(`Cannot close domain ${worker.domain || worker.id}: ${openTasks.length} open domain task(s) remain`);
  }
  const now = new Date().toISOString();
  worker.status = "domain-closed";
  worker.domainStatus = "closed";
  worker.rootActionNeeded = "";
  worker.blockedBy = "";
  worker.blockedReason = "";
  worker.humanResponseNeeded = false;
  worker.closedAt = now;
  worker.closeNote = fields.note || "";
  worker.updatedAt = now;
  ledger.scheduler = normalizeScheduler(ledger.scheduler);
  ledger.scheduler.waitingSet = ledger.scheduler.waitingSet.filter((id) => id !== worker.id);
  ledger.scheduler.doneSet = unique([...ledger.scheduler.doneSet, worker.id]);
  ledger.updatedAt = now;
  refreshPollingState(ledger, now);
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  const event = {
    type: "domain-closed",
    ledgerId,
    workerId: worker.id,
    domain: worker.domain,
    note: fields.note || "",
    at: now
  };
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), event);
  await touchLedgerRegistry(home, ledger);
  return { ledger, worker, event };
}

export async function recordHumanResponse(home, ledgerId, fields = {}) {
  const ledger = await readLedger(home, ledgerId);
  const now = new Date().toISOString();
  ledger.scheduler = normalizeScheduler(ledger.scheduler);
  const targetIds = normalizeList(fields.workerId);
  const affectedWorkers = (ledger.workers || []).filter((worker) =>
    isHumanBlockedWorker(worker) && (targetIds.length === 0 || targetIds.includes(worker.id))
  );
  for (const worker of affectedWorkers) {
    worker.status = "needs-root";
    worker.humanResponseNeeded = false;
    worker.blockedBy = "";
    worker.blockedReason = "";
    worker.rootActionNeeded = fields.note
      ? `Process human response: ${fields.note}`
      : "Process human response and decide the next action.";
    worker.updatedAt = now;
  }
  const event = {
    type: "human-response",
    ledgerId,
    workerIds: affectedWorkers.map((worker) => worker.id),
    note: fields.note || "",
    at: now
  };
  ledger.scheduler.statusInbox = [...ledger.scheduler.statusInbox, event];
  ledger.scheduler.polling = {
    status: "active",
    reason: "Human response recorded; root should drain status inbox before polling again.",
    blockers: [],
    updatedAt: now,
    resumedAt: now
  };
  ledger.updatedAt = now;
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), event);
  await touchLedgerRegistry(home, ledger);
  return { ledger, event };
}

export async function recordRuntimeWake(home, ledgerId, fields = {}) {
  if (!fields.note) throw new Error("runtime wake requires --note");
  const ledger = await readLedger(home, ledgerId);
  const now = new Date().toISOString();
  ledger.scheduler = normalizeScheduler(ledger.scheduler);
  const event = {
    type: "human-wake",
    ledgerId,
    note: fields.note,
    at: now
  };
  ledger.scheduler.statusInbox = [...ledger.scheduler.statusInbox, event];
  ledger.scheduler.polling = {
    status: "active",
    reason: "Human input woke an idle runtime; root should decide the next dispatch.",
    blockers: [],
    updatedAt: now,
    resumedAt: now
  };
  ledger.updatedAt = now;
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), event);
  await touchLedgerRegistry(home, ledger);
  return { ledger, event };
}

export async function recordCodeDispatchPlan(home, ledgerId, fields = {}) {
  if (!fields.objective) throw new Error("runtime plan-code requires --objective");
  const ledger = await readLedger(home, ledgerId);
  const now = new Date().toISOString();
  ledger.scheduler = normalizeScheduler(ledger.scheduler);
  ledger.dispatchPlans = Array.isArray(ledger.dispatchPlans) ? ledger.dispatchPlans : [];
  const route = normalizeDispatchRoute(fields.route || fields.surface || "root");
  const plan = {
    id: fields.planId || `DP${String(ledger.dispatchPlans.length + 1).padStart(3, "0")}`,
    type: "code-dispatch-plan",
    objective: fields.objective,
    route,
    domain: fields.domain || "",
    workerId: fields.workerId || "",
    repoRoot: fields.repoRoot || "",
    worktree: fields.worktree || "",
    nodeId: fields.nodeId || "",
    ownership: fields.ownership || "",
    allowedFiles: normalizeList(fields.allowedFile || fields.allowedFiles),
    verification: normalizeList(fields.verify || fields.verification),
    reasoning: fields.reasoning || defaultReasoningForRoute(route),
    why: fields.why || fields.reason || "",
    stopIf: normalizeList(fields.stopIf),
    status: "",
    missing: [],
    createdAt: now,
    updatedAt: now
  };
  plan.missing = dispatchPlanMissingFields(plan);
  plan.status = plan.missing.length > 0 ? "needs-boundary" : dispatchPlanReadyStatus(plan.route);
  ledger.dispatchPlans = [...ledger.dispatchPlans, plan];
  const event = {
    type: "code-dispatch-planned",
    ledgerId,
    planId: plan.id,
    objective: plan.objective,
    route: plan.route,
    status: plan.status,
    domain: plan.domain,
    workerId: plan.workerId,
    nodeId: plan.nodeId,
    missing: plan.missing,
    rootActionNeeded: plan.status === "needs-boundary"
      ? `Finish dispatch boundaries before handing off ${plan.id}.`
      : `Review and execute code dispatch plan ${plan.id}.`,
    at: now
  };
  ledger.scheduler.statusInbox = [...ledger.scheduler.statusInbox, event];
  ledger.updatedAt = now;
  refreshPollingState(ledger, now);
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), event);
  await touchLedgerRegistry(home, ledger);
  return { ledger, plan, event };
}

export async function recordExternalWait(home, ledgerId, fields = {}) {
  if (!fields.nextCheckAt) throw new Error("runtime wait requires --next-check-at");
  const ledger = await readLedger(home, ledgerId);
  const now = new Date().toISOString();
  ledger.scheduler = normalizeScheduler(ledger.scheduler);
  const wait = {
    id: fields.waitId || `EW${String(ledger.scheduler.externalWaits.length + 1).padStart(3, "0")}`,
    status: "waiting",
    reason: fields.reason || fields.message || "Waiting for an external timer or event.",
    nextCheckAt: fields.nextCheckAt,
    resumeOn: fields.resumeOn || "next-check-at",
    workerId: fields.workerId || "",
    nodeId: fields.nodeId || "",
    repo: fields.repo || "",
    createdAt: now,
    updatedAt: now
  };
  ledger.scheduler.externalWaits = [...ledger.scheduler.externalWaits, wait];
  ledger.updatedAt = now;
  refreshPollingState(ledger, now);
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  const event = {
    type: "external-wait-recorded",
    ledgerId,
    waitId: wait.id,
    reason: wait.reason,
    nextCheckAt: wait.nextCheckAt,
    at: now
  };
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), event);
  await touchLedgerRegistry(home, ledger);
  return { ledger, wait, event };
}

export async function clearExternalWait(home, ledgerId, fields = {}) {
  const ledger = await readLedger(home, ledgerId);
  const now = new Date().toISOString();
  ledger.scheduler = normalizeScheduler(ledger.scheduler);
  const waitIds = normalizeList(fields.waitId);
  let cleared = 0;
  ledger.scheduler.externalWaits = ledger.scheduler.externalWaits.map((wait) => {
    if (wait.status !== "waiting") return wait;
    if (waitIds.length > 0 && !waitIds.includes(wait.id)) return wait;
    cleared += 1;
    return {
      ...wait,
      status: "cleared",
      clearedAt: now,
      clearNote: fields.note || "",
      updatedAt: now
    };
  });
  if (cleared === 0) {
    throw new Error(waitIds.length > 0 ? `Unknown active external wait ${waitIds.join(", ")}` : "No active external waits to clear");
  }
  ledger.updatedAt = now;
  refreshPollingState(ledger, now);
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  const event = {
    type: "external-wait-cleared",
    ledgerId,
    waitIds: waitIds.length > 0 ? waitIds : ["all"],
    note: fields.note || "",
    at: now
  };
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), event);
  await touchLedgerRegistry(home, ledger);
  return { ledger, event };
}

export async function addNode(home, ledgerId, fields = {}) {
  const ledger = await readLedger(home, ledgerId);
  const now = new Date().toISOString();
  ledger.nodes = normalizeNodes(ledger.nodes);
  const kind = normalizeNodeKind(fields.kind || "phase");
  const parentId = fields.parentId || "";
  validateNodeContainment(ledger, parentId, kind);
  const node = {
    id: fields.nodeId || `N${String(ledger.nodes.length + 1).padStart(3, "0")}`,
    parentId,
    kind,
    title: fields.title || titleForNodeKind(kind),
    status: normalizeNodeStatus(fields.state || fields.status || "planned"),
    objective: fields.objective || "",
    owner: fields.owner || "root",
    route: fields.route || "",
    children: [],
    requiredReceipts: normalizeList(fields.requiredReceipt || fields.requiredReceipts),
    receiptRefs: [],
    executionRefs: {
      workerIds: normalizeList(fields.workerId),
      dispatchPlanIds: normalizeList(fields.dispatchPlanId),
      waitIds: normalizeList(fields.waitId)
    },
    decisionGate: null,
    humanBlocker: null,
    createdAt: now,
    updatedAt: now
  };
  if (ledger.nodes.some((candidate) => candidate.id === node.id)) {
    throw new Error(`Node ${node.id} already exists`);
  }
  ledger.nodes = [...ledger.nodes, node];
  refreshNodeStatuses(ledger, now);
  ledger.updatedAt = now;
  refreshPollingState(ledger, now);
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  const event = {
    type: "node-added",
    ledgerId,
    nodeId: node.id,
    parentId: node.parentId,
    kind: node.kind,
    status: node.status,
    at: now
  };
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), event);
  await touchLedgerRegistry(home, ledger);
  return { ledger, node, event };
}

export async function updateNodeStatus(home, ledgerId, fields = {}) {
  if (!fields.nodeId) throw new Error("node status requires --node-id");
  const ledger = await readLedger(home, ledgerId);
  const node = findNode(ledger, fields.nodeId);
  const now = new Date().toISOString();
  node.status = normalizeNodeStatus(fields.state || fields.status);
  node.statusContext = fields.context || fields.message || "";
  node.updatedAt = now;
  if (node.status !== "waiting-human") {
    node.humanBlocker = null;
  }
  refreshNodeStatuses(ledger, now);
  ledger.updatedAt = now;
  refreshPollingState(ledger, now);
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  const event = {
    type: "node-status",
    ledgerId,
    nodeId: node.id,
    status: node.status,
    context: node.statusContext,
    at: now
  };
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), event);
  await touchLedgerRegistry(home, ledger);
  return { ledger, node, event };
}

export async function addNodeDecisionGate(home, ledgerId, fields = {}) {
  if (!fields.parentId) throw new Error("node gate requires --parent-id");
  if (!fields.question) throw new Error("node gate requires --question");
  const options = normalizeOptions(fields.option || fields.options);
  if (options.length < 2 || options.length > 3) {
    throw new Error("node gate requires 2 or 3 --option values");
  }
  const recommendedOptionId = normalizeRecommendedOption(fields.recommendedOptionId || fields.recommended, options);
  const { ledger, node, event } = await addNode(home, ledgerId, {
    nodeId: fields.nodeId,
    parentId: fields.parentId,
    kind: "gate",
    title: fields.title || "Human direction gate",
    objective: fields.question,
    status: "waiting-human"
  });
  const stored = findNode(ledger, node.id);
  stored.decisionGate = {
    question: fields.question,
    options,
    recommendedOptionId,
    decisionOptionId: "",
    decisionReason: ""
  };
  stored.updatedAt = new Date().toISOString();
  refreshNodeStatuses(ledger, stored.updatedAt);
  ledger.updatedAt = stored.updatedAt;
  refreshPollingState(ledger, stored.updatedAt);
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), {
    type: "node-decision-gate-added",
    ledgerId,
    nodeId: stored.id,
    question: fields.question,
    recommendedOptionId,
    at: stored.updatedAt
  });
  await touchLedgerRegistry(home, ledger);
  return { ledger, node: stored, event };
}

export async function decideNodeGate(home, ledgerId, fields = {}) {
  if (!fields.nodeId) throw new Error("node decide requires --node-id");
  if (!fields.option && !fields.optionId) throw new Error("node decide requires --option");
  const ledger = await readLedger(home, ledgerId);
  const node = findNode(ledger, fields.nodeId);
  if (node.kind !== "gate" || !node.decisionGate) {
    throw new Error(`Node ${node.id} is not a decision gate`);
  }
  const optionId = normalizeDecisionOption(fields.optionId || fields.option, node.decisionGate.options);
  const now = new Date().toISOString();
  node.decisionGate.decisionOptionId = optionId;
  node.decisionGate.decisionReason = fields.reason || "";
  node.status = "done";
  node.updatedAt = now;
  refreshNodeStatuses(ledger, now);
  ledger.updatedAt = now;
  refreshPollingState(ledger, now);
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  const event = {
    type: "node-decision-recorded",
    ledgerId,
    nodeId: node.id,
    decisionOptionId: optionId,
    reason: fields.reason || "",
    at: now
  };
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), event);
  await touchLedgerRegistry(home, ledger);
  return { ledger, node, event };
}

export async function blockNodeForHuman(home, ledgerId, fields = {}) {
  if (!fields.nodeId) throw new Error("node block-human requires --node-id");
  if (!fields.blockedThing) throw new Error("node block-human requires --blocked-thing");
  if (!fields.whyBlocked) throw new Error("node block-human requires --why-blocked");
  const ledger = await readLedger(home, ledgerId);
  const node = findNode(ledger, fields.nodeId);
  const options = normalizeOptions(fields.option || fields.options, { allowEmpty: true });
  const now = new Date().toISOString();
  node.status = "waiting-human";
  node.humanBlocker = {
    blockedThing: fields.blockedThing,
    whyBlocked: fields.whyBlocked,
    attempted: fields.attempted || "",
    options,
    recommendedOptionId: options.length ? normalizeRecommendedOption(fields.recommendedOptionId || fields.recommended, options) : "",
    resumeAfterAnswer: fields.resumeAfterAnswer || ""
  };
  node.updatedAt = now;
  refreshNodeStatuses(ledger, now);
  ledger.updatedAt = now;
  refreshPollingState(ledger, now);
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  const event = {
    type: "node-human-blocked",
    ledgerId,
    nodeId: node.id,
    blockedThing: node.humanBlocker.blockedThing,
    whyBlocked: node.humanBlocker.whyBlocked,
    at: now
  };
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), event);
  await touchLedgerRegistry(home, ledger);
  return { ledger, node, event };
}

export async function addNodeReceipt(home, ledgerId, fields = {}) {
  if (!fields.nodeId) throw new Error("node receipt requires --node-id");
  if (!fields.summary) throw new Error("node receipt requires --summary");
  if (!fields.verification) throw new Error("node receipt requires --verification");
  const ledger = await readLedger(home, ledgerId);
  const node = findNode(ledger, fields.nodeId);
  const now = new Date().toISOString();
  const receiptId = fields.receiptId || await nextReceiptId(home, ledgerId);
  const requirement = fields.requirement || nextMissingReceiptRequirement(node) || "";
  const receipt = {
    type: "node-receipt",
    receiptId,
    ledgerId,
    nodeId: node.id,
    requirement,
    summary: fields.summary,
    verification: fields.verification,
    at: now
  };
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "receipts.jsonl"), receipt);
  node.receiptRefs = [...(node.receiptRefs || []), { receiptId, requirement }];
  if (receiptRequirementsSatisfied(node) && ((node.requiredReceipts || []).length > 0 || (node.children || []).length > 0)) {
    node.status = "gate-ready";
  } else if (!node.children?.length && !NODE_TERMINAL_STATUSES.includes(node.status)) {
    node.status = "done";
  }
  node.updatedAt = now;
  refreshNodeStatuses(ledger, now);
  ledger.updatedAt = now;
  refreshPollingState(ledger, now);
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  const event = {
    type: "node-receipt-recorded",
    ledgerId,
    nodeId: node.id,
    receiptId,
    requirement,
    at: now
  };
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), event);
  await touchLedgerRegistry(home, ledger);
  return { ledger, node, receipt, event };
}

export async function passNode(home, ledgerId, fields = {}) {
  if (!fields.nodeId) throw new Error("node pass requires --node-id");
  const ledger = await readLedger(home, ledgerId);
  const node = findNode(ledger, fields.nodeId);
  const now = new Date().toISOString();
  refreshNodeStatuses(ledger, now);
  if (node.status !== "gate-ready" && !toBoolean(fields.force)) {
    throw new Error(`Cannot pass node ${node.id}: status is ${node.status}, expected gate-ready`);
  }
  for (const receiptId of normalizeList(fields.receipt || fields.receiptId)) {
    node.receiptRefs = uniqueReceiptRefs([...(node.receiptRefs || []), { receiptId, requirement: "" }]);
  }
  node.status = "passed";
  node.passedAt = now;
  node.passNote = fields.note || "";
  node.updatedAt = now;
  refreshNodeStatuses(ledger, now);
  ledger.updatedAt = now;
  refreshPollingState(ledger, now);
  await writeJson(path.join(ledgerDir(home, ledgerId), "ledger.json"), ledger);
  const event = {
    type: "node-passed",
    ledgerId,
    nodeId: node.id,
    note: fields.note || "",
    at: now
  };
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), event);
  await touchLedgerRegistry(home, ledger);
  return { ledger, node, event };
}

export async function showNode(home, ledgerId, fields = {}) {
  if (!fields.nodeId) throw new Error("node show requires --node-id");
  const ledger = await readLedger(home, ledgerId);
  refreshNodeStatuses(ledger, new Date().toISOString());
  const node = findNode(ledger, fields.nodeId);
  const receipts = await readJsonl(path.join(ledgerDir(home, ledgerId), "receipts.jsonl"));
  const receiptIds = new Set((node.receiptRefs || []).map((ref) => ref.receiptId));
  return {
    node,
    children: normalizeNodes(ledger.nodes).filter((candidate) => candidate.parentId === node.id),
    receiptDetails: receipts.filter((receipt) => receiptIds.has(receipt.receiptId))
  };
}

export async function renderNodeTree(home, ledgerId, fields = {}) {
  const ledger = await readLedger(home, ledgerId);
  refreshNodeStatuses(ledger, new Date().toISOString());
  const nodes = normalizeNodes(ledger.nodes);
  if (!nodes.length) return "No nodes recorded.";
  const rootId = fields.nodeId || "";
  const roots = rootId
    ? [findNode(ledger, rootId)]
    : nodes.filter((node) => !node.parentId);
  return roots.map((node) => renderNodeBranch(node, nodes, 0)).join("\n");
}

export async function readBoard(home, boardId) {
  return readJson(path.join(boardDir(home, boardId), "board.json"));
}

export async function approveBoard(home, boardId, { note = "" } = {}) {
  const board = await readBoard(home, boardId);
  const plan = await readPlan(home, board.planId);
  const now = new Date().toISOString();
  board.status = "approved";
  board.approvedAt = now;
  board.approvalNote = note;
  board.updatedAt = now;
  await writeJson(path.join(boardDir(home, boardId), "board.json"), board);
  await appendJsonl(path.join(boardDir(home, boardId), "events.jsonl"), {
    type: "plan-board-approved",
    goalId: board.goalId,
    planId: board.planId,
    boardId,
    note,
    at: now
  });
  await upsertRegistryEntry(home, "boards", {
    id: board.id,
    goalId: board.goalId,
    planId: board.planId,
    path: path.join(boardDir(home, board.id), "board.json"),
    status: board.status,
    updatedAt: now
  });
  plan.status = "approved-for-board";
  plan.updatedAt = now;
  await writeJson(path.join(planDir(home, plan.id), "plan.json"), plan);
  await upsertRegistryEntry(home, "plans", {
    id: plan.id,
    goalId: plan.goalId,
    path: path.join(planDir(home, plan.id), "plan.json"),
    status: plan.status,
    updatedAt: now
  });
  return board;
}

export async function appendRuntimeEvent(home, ledgerId, event) {
  const entry = {
    type: event.type || "runtime-event",
    ledgerId,
    message: event.message || "",
    at: new Date().toISOString()
  };
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "events.jsonl"), entry);
  return entry;
}

export async function appendReceipt(home, ledgerId, receipt) {
  const receiptId = receipt.receiptId || await nextReceiptId(home, ledgerId);
  const entry = {
    type: "receipt",
    receiptId,
    ledgerId,
    taskId: receipt.taskId || "",
    nodeId: receipt.nodeId || "",
    summary: receipt.summary || "",
    verification: receipt.verification || "",
    at: new Date().toISOString()
  };
  await appendJsonl(path.join(ledgerDir(home, ledgerId), "receipts.jsonl"), entry);
  return entry;
}

export async function loadSnapshot(home) {
  const registry = await readRegistry(home);
  const goals = await Promise.all(
    registry.goals.map((entry) => readJson(entry.path).catch(() => null))
  );
  const plans = await Promise.all(
    registry.plans.map(async (entry) => {
      try {
        const plan = await readJson(entry.path);
        const decisions = await readJsonl(path.join(planDir(home, plan.id), "decisions.jsonl"));
        return {
          ...plan,
          decisions,
          openDecisions: getOpenPlanDecisions(decisions)
        };
      } catch {
        return null;
      }
    })
  );
  const boards = await Promise.all(
    registry.boards.map(async (entry) => {
      try {
        const board = await readJson(entry.path);
        return {
          ...board,
          events: await readJsonl(path.join(boardDir(home, board.id), "events.jsonl"))
        };
      } catch {
        return null;
      }
    })
  );
  const ledgers = await Promise.all(
    registry.ledgers.map(async (entry) => {
      try {
        const ledger = await readJson(entry.path);
        return {
          ...ledger,
          events: await readJsonl(path.join(ledgerDir(home, ledger.id), "events.jsonl")),
          receipts: await readJsonl(path.join(ledgerDir(home, ledger.id), "receipts.jsonl"))
        };
      } catch {
        return null;
      }
    })
  );
  return {
    registry,
    goals: goals.filter(Boolean),
    plans: plans.filter(Boolean),
    boards: boards.filter(Boolean),
    ledgers: ledgers.filter(Boolean)
  };
}

export function parseMarkdownPlan(markdown) {
  const lines = markdown.split(/\r?\n/);
  const title = lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim();
  const sections = [];
  for (const [index, line] of lines.entries()) {
    const match = /^(#{2,4})\s+(.+)$/.exec(line);
    if (!match) continue;
    const heading = match[2].trim();
    const ids = unique([...heading.matchAll(PLAN_ID_PATTERN)].map((item) => item[1]));
    sections.push({
      id: `S${String(sections.length + 1).padStart(3, "0")}`,
      level: match[1].length,
      heading,
      sourceIds: ids,
      line: index + 1
    });
  }
  for (const [index, section] of sections.entries()) {
    const next = sections
      .slice(index + 1)
      .find((candidate) => candidate.level <= section.level);
    const startLine = section.line;
    const endLine = next ? next.line - 1 : lines.length;
    const body = lines.slice(startLine, endLine).join("\n");
    section.sourceIds = unique([
      ...section.sourceIds,
      ...[...body.matchAll(PLAN_ID_PATTERN)].map((item) => item[1])
    ]);
  }
  const sourceIds = unique([...markdown.matchAll(PLAN_ID_PATTERN)].map((item) => item[1]));
  return {
    title,
    sourceIds,
    sections,
    phases: sections.filter((section) => /\bphase\b/i.test(section.heading)),
    workstreams: sections.filter((section) => /`[^`]+`|repo|workstream/i.test(section.heading))
  };
}

function buildTasks(goal, plan) {
  const goalRef = {
    goalId: goal.id,
    objective: goal.refined.statement || goal.originalSeed,
    successProof: goal.refined.successProof
  };
  const tasks = [
    {
      id: "T001",
      type: "plan-review",
      assignee: "planner",
      status: "active",
      objective: "Validate the refined goal and reviewed plan before execution.",
      goalRef,
      planRefs: [
        {
          planId: plan.id,
          section: "full-plan",
          sourceIds: plan.sourceIds
        }
      ],
      receipt: null
    }
  ];

  const phaseSections = plan.phases.length > 0 ? plan.phases : plan.sections.slice(0, 5);
  for (const [index, section] of phaseSections.entries()) {
    const number = String(index + 2).padStart(3, "0");
    tasks.push({
      id: `T${number}`,
      type: "plan-slice",
      assignee: "planner",
      status: "queued",
      objective: `Turn plan section into an executable work package: ${section.heading}`,
      goalRef,
      planRefs: [
        {
          planId: plan.id,
          sectionId: section.id,
          heading: section.heading,
          sourceIds: section.sourceIds.length ? section.sourceIds : plan.sourceIds
        }
      ],
      allowedFiles: [],
      verify: [],
      stopIf: [
        "Goal intent or success proof is unclear.",
        "The work no longer traces to the reviewed plan.",
        "Verification cannot be named before runtime work starts."
      ],
      receipt: null
    });
  }

  tasks.push({
    id: "T999",
    type: "plan-approval",
    assignee: "planner",
    status: "queued",
    objective: "Approve the plan board for runtime execution or send it back for refinement.",
    goalRef,
    planRefs: [
      {
        planId: plan.id,
        section: "completion-audit",
        sourceIds: plan.sourceIds
      }
    ],
    receipt: null
  });
  return tasks;
}

async function writeCompileReport(home, goal, plan, board) {
  const unmapped = plan.sourceIds.filter((sourceId) =>
    !board.tasks.some((task) =>
      task.planRefs.some((ref) => Array.isArray(ref.sourceIds) && ref.sourceIds.includes(sourceId))
    )
  );
  const report = [
    `# Compile Report: ${plan.title}`,
    "",
    `Goal ID: ${goal.id}`,
    `Plan ID: ${plan.id}`,
    `Board ID: ${board.id}`,
    "Runtime ledger: not started",
    "",
    "## Traceability",
    "",
    ...board.tasks.map((task) => `- ${task.id}: ${task.objective}`),
    "",
    "## Unmapped Plan IDs",
    "",
    unmapped.length ? unmapped.map((id) => `- ${id}`).join("\n") : "None"
  ].join("\n");
  await fs.writeFile(path.join(planDir(home, plan.id), "compile-report.md"), `${report}\n`);
}

function defaultPlanDraft(goal) {
  return renderHumanDraftTemplate(goal);
}

function assignIfPresent(target, key, value) {
  if (value !== undefined && value !== "") target[key] = value;
}

function appendList(list, values) {
  const input = normalizeList(values);
  for (const value of input) list.push(value);
}

function normalizeList(values) {
  if (Array.isArray(values)) return values.filter(Boolean);
  return values ? [values] : [];
}

function findSectionHeading(plan, sectionId) {
  if (!sectionId) return "";
  return plan.sections.find((section) => section.id === sectionId)?.heading || "";
}

function findWorker(ledger, workerId) {
  const worker = (ledger.workers || []).find((candidate) => candidate.id === workerId);
  if (!worker) throw new Error(`Unknown worker ${workerId}`);
  return worker;
}

function openDomainTasks(worker) {
  return (worker.domainTasks || []).filter((task) =>
    !["done", "parked", "canceled"].includes(task.status)
  );
}

function normalizeScheduler(scheduler = {}) {
  return {
    callStack: scheduler.callStack || "idle",
    readyQueue: Array.isArray(scheduler.readyQueue) ? scheduler.readyQueue : [],
    waitingSet: Array.isArray(scheduler.waitingSet) ? scheduler.waitingSet : [],
    statusInbox: Array.isArray(scheduler.statusInbox) ? scheduler.statusInbox : [],
    doneSet: Array.isArray(scheduler.doneSet) ? scheduler.doneSet : [],
    externalWaits: Array.isArray(scheduler.externalWaits) ? scheduler.externalWaits : [],
    polling: scheduler.polling || {
      status: "active",
      reason: "",
      blockers: [],
      updatedAt: ""
    }
  };
}

function refreshPollingState(ledger, now) {
  ledger.scheduler = normalizeScheduler(ledger.scheduler);
  refreshNodeStatuses(ledger, now);
  const callStackIdle = !ledger.scheduler.callStack || ledger.scheduler.callStack === "idle";
  const readyQueue = ledger.scheduler.readyQueue.filter(Boolean);
  const waitingWorkers = ledger.scheduler.waitingSet
    .map((workerId) => (ledger.workers || []).find((worker) => worker.id === workerId))
    .filter((worker) => worker && !["done", "domain-closed"].includes(worker.status));
  const nonHumanActionableInbox = ledger.scheduler.statusInbox.some((event) =>
    isActionableEvent(event) && !isHumanBlockedEvent(event)
  );
  const actionableWaitingWorkers = waitingWorkers.filter((worker) => isActionableWorker(worker));
  const humanBlockedWorkers = actionableWaitingWorkers.filter((worker) => isHumanBlockedWorker(worker));
  const actionableNodes = normalizeNodes(ledger.nodes).filter((node) => isActionableNode(node));
  const humanBlockedNodes = actionableNodes.filter((node) => isHumanBlockedNode(node));
  const externalWaitingNodes = actionableNodes.filter((node) => node.status === "waiting-external");
  const nonHumanActionableNodes = actionableNodes.filter((node) =>
    !isHumanBlockedNode(node) && node.status !== "waiting-external"
  );
  const activeExternalWaits = ledger.scheduler.externalWaits.filter((wait) => wait.status === "waiting");
  const futureExternalWaits = activeExternalWaits.filter((wait) => isFutureWait(wait, now));
  const dueExternalWaits = activeExternalWaits.filter((wait) => !isFutureWait(wait, now));
  const noRunnableRootWork = callStackIdle &&
    readyQueue.length === 0 &&
    !nonHumanActionableInbox &&
    nonHumanActionableNodes.length === 0;
  const allActionableWorkBlockedOnHuman =
    externalWaitingNodes.length === 0 &&
    humanBlockedWorkers.length + humanBlockedNodes.length > 0 &&
    humanBlockedWorkers.length === actionableWaitingWorkers.length &&
    humanBlockedNodes.length === actionableNodes.length;

  if (noRunnableRootWork && allActionableWorkBlockedOnHuman && dueExternalWaits.length === 0) {
    ledger.scheduler.polling = {
      status: "paused-human",
      reason: "All active work is waiting on human response.",
      blockers: [
        ...humanBlockedWorkers.map((worker) => ({
          workerId: worker.id,
          domain: worker.domain || "",
          blockedReason: worker.blockedReason || worker.lastMessage || worker.rootActionNeeded || "Human response needed.",
          rootActionNeeded: worker.rootActionNeeded || ""
        })),
        ...humanBlockedNodes.map((node) => ({
          nodeId: node.id,
          title: node.title,
          blockedReason: node.humanBlocker?.whyBlocked || node.decisionGate?.question || node.statusContext || "Human response needed.",
          rootActionNeeded: node.humanBlocker?.resumeAfterAnswer || ""
        }))
      ],
      pausedAt: ledger.scheduler.polling?.status === "paused-human"
        ? ledger.scheduler.polling.pausedAt
        : now,
      updatedAt: now,
      resumeAfter: "runtime human-response"
    };
    return;
  }

  if (
    noRunnableRootWork &&
    actionableWaitingWorkers.length === 0 &&
    humanBlockedNodes.length === 0 &&
    nonHumanActionableNodes.length === 0 &&
    dueExternalWaits.length === 0 &&
    (futureExternalWaits.length > 0 || externalWaitingNodes.length > 0)
  ) {
    const nextWait = [...futureExternalWaits].sort((left, right) =>
      Date.parse(left.nextCheckAt) - Date.parse(right.nextCheckAt)
    )[0] || null;
    ledger.scheduler.polling = {
      status: "waiting-external",
      reason: nextWait?.reason || externalWaitingNodes[0]?.statusContext || "Waiting for an external timer or event.",
      blockers: [
        ...futureExternalWaits.map((wait) => ({
          waitId: wait.id,
          reason: wait.reason,
          nextCheckAt: wait.nextCheckAt,
          resumeOn: wait.resumeOn,
          workerId: wait.workerId || "",
          nodeId: wait.nodeId || "",
          repo: wait.repo || ""
        })),
        ...externalWaitingNodes.map((node) => ({
          nodeId: node.id,
          title: node.title,
          reason: node.statusContext || "Waiting for an external timer or event."
        }))
      ],
      nextCheckAt: nextWait?.nextCheckAt || "",
      updatedAt: now,
      resumeAfter: "runtime clear-wait or next-check-at"
    };
    return;
  }

  if (noRunnableRootWork && actionableWaitingWorkers.length === 0 && actionableNodes.length === 0 && activeExternalWaits.length === 0) {
    ledger.scheduler.polling = {
      status: "idle",
      reason: "No work to poll; waiting for new human input.",
      blockers: [],
      idleAt: ledger.scheduler.polling?.status === "idle"
        ? ledger.scheduler.polling.idleAt
        : now,
      updatedAt: now,
      resumeAfter: "runtime wake"
    };
    return;
  }

  ledger.scheduler.polling = {
    status: "active",
    reason: dueExternalWaits.length > 0 ? "External wait is due; root should check whether it can resume work." : "",
    blockers: [],
    dueExternalWaits: dueExternalWaits.map((wait) => ({
      waitId: wait.id,
      reason: wait.reason,
      nextCheckAt: wait.nextCheckAt,
      resumeOn: wait.resumeOn,
      workerId: wait.workerId || "",
      repo: wait.repo || ""
    })),
    updatedAt: now
  };
}

function isActionableEvent(event) {
  return ["needs-root", "blocked", "ready-for-review", "done"].includes(event.state) ||
    event.rootActionNeeded ||
    event.type === "human-response" ||
    event.type === "human-wake" ||
    event.type === "code-dispatch-planned";
}

function isHumanBlockedEvent(event) {
  return event.humanResponseNeeded === true || event.blockedBy === "human";
}

function isHumanBlock(fields, worker) {
  return toBoolean(fields.requiresHuman) ||
    fields.blockedBy === "human" ||
    /human|user|owner|approval|decision|reply|response/i.test(fields.message || "") ||
    /human|user|owner|approval|decision|reply|response/i.test(fields.blockedReason || "") ||
    /human|user|owner|approval|decision|reply|response/i.test(fields.rootActionNeeded || "") ||
    /human|user|owner|approval|decision|reply|response/i.test(worker.rootActionNeeded || "");
}

function isHumanBlockedWorker(worker) {
  return worker.status === "blocked" &&
    (worker.humanResponseNeeded === true || worker.blockedBy === "human");
}

function isActionableWorker(worker) {
  if (isHumanBlockedWorker(worker)) return true;
  if (worker.status === "domain-idle" || worker.status === "domain-closed" || worker.status === "done") return false;
  if (worker.ownsDomain && openDomainTasks(worker).length > 0) return true;
  return ["blocked", "needs-root", "ready-for-review", "domain-active", "domain-ready-for-close", "waiting"].includes(worker.status) ||
    Boolean(worker.rootActionNeeded);
}

function isActionableNode(node) {
  return ["planned", "active", "waiting-human", "waiting-external", "blocked", "gate-ready"].includes(node.status);
}

function isHumanBlockedNode(node) {
  return node.status === "waiting-human";
}

function isFutureWait(wait, now) {
  const checkAt = Date.parse(wait.nextCheckAt || "");
  const current = Date.parse(now);
  return Number.isFinite(checkAt) && Number.isFinite(current) && checkAt > current;
}

function normalizeDispatchRoute(route) {
  const value = String(route || "root").toLowerCase();
  if (["root", "root-only", "root-chat"].includes(value)) return "root";
  if (["subagent", "subworker"].includes(value)) return "subagent";
  if (["subagent-worktree", "worktree", "worker-worktree"].includes(value)) return "subagent-worktree";
  if (["domain-owner", "domain-owned-chat", "domain-owner-chat"].includes(value)) return "domain-owner-chat";
  if (["child-chat", "child"].includes(value)) return "child-chat";
  throw new Error(`Unknown code dispatch route: ${route}`);
}

function defaultReasoningForRoute(route) {
  if (route === "subagent") return "low";
  if (route === "root") return "high";
  return "medium";
}

function dispatchPlanMissingFields(plan) {
  const missing = [];
  if (plan.route !== "root" && !plan.ownership && plan.allowedFiles.length === 0) {
    missing.push("ownership");
  }
  if (plan.route !== "root" && plan.verification.length === 0) {
    missing.push("verification");
  }
  if (plan.route === "domain-owner-chat" && !plan.domain && !plan.workerId) {
    missing.push("domain-or-worker-id");
  }
  if (plan.route === "subagent-worktree" && !plan.worktree) {
    missing.push("worktree");
  }
  return missing;
}

function dispatchPlanReadyStatus(route) {
  if (route === "root") return "root-owned";
  return "ready-to-dispatch";
}

function normalizeNodes(nodes = []) {
  return Array.isArray(nodes) ? nodes : [];
}

function normalizeNodeKind(kind) {
  const value = String(kind || "").toLowerCase();
  if (!NODE_KINDS.includes(value)) {
    throw new Error(`Unknown node kind: ${kind}`);
  }
  return value;
}

function normalizeNodeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (!NODE_STATUSES.includes(value)) {
    throw new Error(`Unknown node status: ${status}`);
  }
  return value;
}

function titleForNodeKind(kind) {
  return `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}`;
}

function validateNodeContainment(ledger, parentId, kind) {
  if (!parentId) {
    if (!NODE_CONTAINMENT.root.includes(kind)) {
      throw new Error(`Top-level node kind ${kind} is not allowed; create a phase first`);
    }
    return;
  }
  const parent = findNode(ledger, parentId);
  if (NODE_TERMINAL_STATUSES.includes(parent.status)) {
    throw new Error(`Cannot add a child to ${parent.status} node ${parent.id}`);
  }
  const allowed = NODE_CONTAINMENT[parent.kind] || [];
  if (!allowed.includes(kind)) {
    throw new Error(`Node kind ${kind} cannot be added under ${parent.kind} ${parent.id}`);
  }
}

function findNode(ledger, nodeId) {
  const node = normalizeNodes(ledger.nodes).find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`Unknown node ${nodeId}`);
  return node;
}

function refreshNodeStatuses(ledger, now) {
  ledger.nodes = normalizeNodes(ledger.nodes).map((node) => ({
    ...node,
    children: []
  }));
  const byId = new Map(ledger.nodes.map((node) => [node.id, node]));
  for (const node of ledger.nodes) {
    if (!node.parentId) continue;
    const parent = byId.get(node.parentId);
    if (parent) parent.children = unique([...(parent.children || []), node.id]);
  }

  const depths = new Map();
  const depthOf = (node) => {
    if (depths.has(node.id)) return depths.get(node.id);
    const parent = node.parentId ? byId.get(node.parentId) : null;
    const depth = parent ? depthOf(parent) + 1 : 0;
    depths.set(node.id, depth);
    return depth;
  };
  for (const node of ledger.nodes) depthOf(node);

  const ordered = [...ledger.nodes].sort((left, right) => depthOf(right) - depthOf(left));
  for (const node of ordered) {
    const children = (node.children || []).map((id) => byId.get(id)).filter(Boolean);
    if (!children.length || NODE_TERMINAL_STATUSES.includes(node.status)) continue;
    const nextStatus = aggregateNodeStatus(node, children);
    if (node.status !== nextStatus) {
      node.status = nextStatus;
      node.updatedAt = now;
    }
  }
}

function aggregateNodeStatus(node, children) {
  const openChildren = children.filter((child) => !NODE_DONE_STATUSES.includes(child.status));
  if (openChildren.length > 0) {
    if (openChildren.every((child) => child.status === "waiting-human")) return "waiting-human";
    if (openChildren.every((child) => child.status === "waiting-external")) return "waiting-external";
    return "active";
  }
  if (receiptRequirementsSatisfied(node)) return "gate-ready";
  return "active";
}

function receiptRequirementsSatisfied(node) {
  const required = node.requiredReceipts || [];
  if (!required.length) return true;
  const refs = node.receiptRefs || [];
  return required.every((requirement) =>
    refs.some((ref) => ref.requirement === requirement || ref.receiptId === requirement)
  );
}

function nextMissingReceiptRequirement(node) {
  const required = node.requiredReceipts || [];
  const refs = node.receiptRefs || [];
  return required.find((requirement) =>
    !refs.some((ref) => ref.requirement === requirement || ref.receiptId === requirement)
  );
}

function uniqueReceiptRefs(refs) {
  const seen = new Set();
  const result = [];
  for (const ref of refs) {
    const key = `${ref.receiptId}:${ref.requirement || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function normalizeOptions(values, { allowEmpty = false } = {}) {
  const input = normalizeList(values);
  if (!input.length && allowEmpty) return [];
  return input.map((value, index) => ({
    optionId: `O${index + 1}`,
    label: value,
    impact: ""
  }));
}

function normalizeRecommendedOption(value, options) {
  if (!options.length) return "";
  if (value === undefined || value === "") return options[0].optionId;
  const raw = String(value);
  const optionId = /^\d+$/.test(raw) ? `O${raw}` : raw;
  if (!options.some((option) => option.optionId === optionId)) {
    throw new Error(`Recommended option ${raw} is not one of ${options.map((option) => option.optionId).join(", ")}`);
  }
  return optionId;
}

function normalizeDecisionOption(value, options) {
  const raw = String(value || "");
  const optionId = /^\d+$/.test(raw) ? `O${raw}` : raw;
  if (!options.some((option) => option.optionId === optionId)) {
    throw new Error(`Decision option ${raw} is not one of ${options.map((option) => option.optionId).join(", ")}`);
  }
  return optionId;
}

function renderNodeBranch(node, nodes, depth) {
  const indent = "  ".repeat(depth);
  const line = `${indent}${node.id} ${node.kind} ${node.status} ${node.title}`.trimEnd();
  const children = nodes.filter((candidate) => candidate.parentId === node.id);
  if (!children.length) return line;
  return [line, ...children.map((child) => renderNodeBranch(child, nodes, depth + 1))].join("\n");
}

async function nextReceiptId(home, ledgerId) {
  const receipts = await readJsonl(path.join(ledgerDir(home, ledgerId), "receipts.jsonl"));
  return `R${String(receipts.length + 1).padStart(3, "0")}`;
}

async function touchLedgerRegistry(home, ledger) {
  await upsertRegistryEntry(home, "ledgers", {
    id: ledger.id,
    goalId: ledger.goalId,
    planId: ledger.planId,
    boardId: ledger.boardId,
    path: path.join(ledgerDir(home, ledger.id), "ledger.json"),
    status: ledger.status,
    updatedAt: ledger.updatedAt
  });
}

function toBoolean(value) {
  return value === true || value === "true" || value === "yes" || value === "1";
}

function getOpenPlanDecisions(decisions) {
  const resolved = new Set(
    decisions
      .filter((decision) => decision.type === "plan-decision-resolved")
      .map((decision) => decision.decisionId)
  );
  return decisions.filter((decision) =>
    decision.type === "plan-decision" &&
    !resolved.has(decision.decisionId) &&
    decision.status !== "resolved" &&
    decision.status !== "accepted"
  );
}

function unique(values) {
  return [...new Set(values)];
}
