import http from "node:http";
import { loadSnapshot } from "./model.js";

export async function startConsole({ home, host = "127.0.0.1", port = 8787 }) {
  const server = http.createServer(async (request, response) => {
    try {
      if (request.url === "/api/health") {
        sendJson(response, { ok: true });
        return;
      }
      if (request.url === "/api/snapshot" || request.url === "/api/registry") {
        sendJson(response, await loadSnapshot(home));
        return;
      }
      const snapshot = await loadSnapshot(home);
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(renderConsoleHtml(snapshot));
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    server,
    url: `http://${host}:${port}`
  };
}

export function renderConsoleHtml(snapshot) {
  const currentGoal = last(snapshot.goals);
  const currentPlan = last(snapshot.plans);
  const currentBoard = last(snapshot.boards);
  const currentLedger = last(snapshot.ledgers);
  const tasks = currentBoard?.tasks ?? [];
  const receipts = currentLedger?.receipts ?? [];
  const events = currentLedger?.events ?? [];
  const decisions = currentPlan?.decisions ?? [];
  const workers = currentLedger?.workers ?? [];
  const dispatchPlans = currentLedger?.dispatchPlans ?? [];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Async Dispatch Console</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --ink: #17202a;
      --muted: #667085;
      --line: #d6dae1;
      --accent: #0f766e;
      --warn: #b45309;
      --bad: #b42318;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      padding: 18px 24px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
    }
    h1, h2, h3 { margin: 0; }
    h1 { font-size: 18px; }
    h2 { font-size: 15px; margin-bottom: 10px; }
    h3 { font-size: 13px; color: var(--muted); margin-top: 14px; }
    main {
      padding: 18px 24px 28px;
      display: grid;
      grid-template-columns: 1.1fr .9fr;
      gap: 16px;
    }
    section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      min-width: 0;
    }
    .wide { grid-column: 1 / -1; }
    .grid { display: grid; gap: 10px; }
    .kv { display: grid; grid-template-columns: 160px 1fr; gap: 6px 12px; }
    .label { color: var(--muted); }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border-top: 1px solid var(--line);
      padding: 8px 6px;
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    th { color: var(--muted); font-weight: 600; }
    .pill {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 999px;
      background: #e6f4f1;
      color: var(--accent);
      font-size: 12px;
      white-space: nowrap;
    }
    .empty { color: var(--muted); }
    @media (max-width: 900px) {
      main { grid-template-columns: 1fr; padding: 12px; }
      header { padding: 14px 12px; align-items: flex-start; flex-direction: column; }
      .kv { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Async Dispatch Console</h1>
      <div class="label">Goal-first planning, board, runtime, and receipts</div>
    </div>
    <code>${escapeHtml(snapshot.registry.updatedAt || "")}</code>
  </header>
  <main>
    <section>
      <h2>Goal View</h2>
      ${goalView(currentGoal)}
    </section>
    <section>
      <h2>Plan View</h2>
      ${planView(currentPlan)}
    </section>
    <section class="wide">
      <h2>Board View</h2>
      ${boardView(tasks)}
    </section>
    <section class="wide">
      <h2>Draft Review</h2>
      ${draftReviewView(decisions)}
    </section>
    <section>
      <h2>Runtime View</h2>
      ${runtimeView(currentLedger, events)}
    </section>
	    <section>
	      <h2>Receipts</h2>
	      ${receiptView(receipts)}
	    </section>
	    <section class="wide">
	      <h2>Code Dispatch Plans</h2>
	      ${dispatchPlanView(dispatchPlans)}
	    </section>
	    <section class="wide">
	      <h2>Workers</h2>
	      ${workerView(workers)}
    </section>
    <section class="wide">
      <h2>Trace View</h2>
      ${traceView(currentGoal, currentPlan, currentBoard, currentLedger, tasks)}
    </section>
  </main>
</body>
</html>`;
}

function goalView(goal) {
  if (!goal) return `<p class="empty">No goal created yet.</p>`;
  return `<div class="kv">
    <div class="label">Original goal seed</div><div>${escapeHtml(goal.originalSeed)}</div>
    <div class="label">Refined goal statement</div><div>${escapeHtml(goal.refined.statement || "Not refined yet")}</div>
    <div class="label">Purpose</div><div>${escapeHtml(goal.refined.purpose || "Not recorded")}</div>
    <div class="label">Success proof / oracle</div><div>${escapeHtml(goal.refined.successProof || "Not recorded")}</div>
    <div class="label">Constraints</div><div>${list(goal.refined.constraints)}</div>
    <div class="label">Non-goals</div><div>${list(goal.refined.nonGoals)}</div>
    <div class="label">Open questions</div><div>${list(goal.refined.openQuestions)}</div>
    <div class="label">Context gathered</div><div>${list(goal.refined.contextGathered)}</div>
    <div class="label">Current confidence</div><div>${escapeHtml(goal.refined.confidence)}</div>
    <div class="label">Current phase</div><div>${escapeHtml(goal.refined.phase)}</div>
  </div>`;
}

function planView(plan) {
  if (!plan) return `<p class="empty">No plan drafted yet.</p>`;
  return `<div class="grid">
    <div><span class="label">Plan ID:</span> <code>${escapeHtml(plan.id)}</code></div>
    <div><span class="label">Status:</span> <span class="pill">${escapeHtml(plan.status)}</span></div>
    <div><span class="label">Source:</span> <code>${escapeHtml(plan.source?.path || "")}</code></div>
    <div><span class="label">Draft loop count:</span> ${escapeHtml(plan.enrichmentCount || 0)}</div>
    <div><span class="label">Open review comments:</span> ${escapeHtml(plan.openDecisions?.length || 0)}</div>
    <div><span class="label">Ready:</span> ${escapeHtml(plan.readyAt || "not ready")}</div>
    <div><span class="label">Source IDs:</span> ${list(plan.sourceIds)}</div>
    <h3>Phases</h3>
    ${list(plan.phases.map((phase) => phase.heading))}
    <h3>Workstreams</h3>
    ${list(plan.workstreams.map((workstream) => workstream.heading))}
  </div>`;
}

function draftReviewView(decisions) {
  const reviewDecisions = decisions.filter((decision) =>
    decision.type === "plan-decision" ||
    decision.type === "plan-decision-resolved" ||
    decision.type === "plan-reviewed" ||
    decision.type === "plan-enriched" ||
    decision.type === "plan-ready"
  );
  if (!reviewDecisions.length) {
    return `<p class="empty">No draft review decisions recorded yet.</p>`;
  }
  return `<table>
    <thead><tr><th style="width: 130px">Event</th><th style="width: 90px">ID</th><th style="width: 110px">Status</th><th style="width: 160px">Section</th><th style="width: 160px">Source IDs</th><th>Decision</th><th>Resolution</th></tr></thead>
    <tbody>
      ${reviewDecisions.map((decision) => `<tr>
        <td>${escapeHtml(decision.type || "")}</td>
        <td><code>${escapeHtml(decision.decisionId || "")}</code></td>
        <td><span class="pill">${escapeHtml(decision.status || decision.decision || "")}</span></td>
        <td>${escapeHtml(decision.sectionId || "")} ${escapeHtml(decision.sectionHeading || "")}</td>
        <td>${escapeHtml((decision.sourceIds || []).join(", "))}</td>
        <td>${escapeHtml(decision.note || "")}</td>
        <td>${escapeHtml(decision.resolution || "")}</td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}

function boardView(tasks) {
  if (!tasks.length) return `<p class="empty">No board compiled yet.</p>`;
  return `<table>
    <thead><tr><th style="width: 70px">Task</th><th style="width: 100px">Status</th><th>Objective</th><th>Plan refs</th></tr></thead>
    <tbody>
      ${tasks.map((task) => `<tr>
        <td><code>${escapeHtml(task.id)}</code></td>
        <td><span class="pill">${escapeHtml(task.status)}</span></td>
        <td>${escapeHtml(task.objective)}</td>
        <td>${escapeHtml(task.planRefs.flatMap((ref) => ref.sourceIds || [ref.heading || ref.section]).join(", "))}</td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}

function runtimeView(ledger, events) {
  if (!ledger) return `<p class="empty">No runtime ledger yet.</p>`;
  const scheduler = ledger.scheduler || {};
  const polling = scheduler.polling || { status: "active", reason: "", blockers: [] };
  const externalWaits = scheduler.externalWaits || [];
  return `<div class="kv">
    <div class="label">Ledger</div><div><code>${escapeHtml(ledger.id)}</code></div>
    <div class="label">Polling</div><div><span class="pill">${escapeHtml(polling.status || "active")}</span> ${escapeHtml(pollingSummary(polling))}</div>
    <div class="label">State detail</div><div>${escapeHtml(polling.reason || "None")}</div>
    <div class="label">Human blockers / waits</div><div>${blockerList(polling.blockers || [])}</div>
    <div class="label">Next check</div><div>${escapeHtml(polling.nextCheckAt || "None")}</div>
    <div class="label">Call stack</div><div>${escapeHtml(scheduler.callStack || "idle")}</div>
    <div class="label">Ready queue</div><div>${list(scheduler.readyQueue || [])}</div>
    <div class="label">Waiting set</div><div>${list(scheduler.waitingSet || [])}</div>
    <div class="label">External waits</div><div>${externalWaitList(externalWaits)}</div>
    <div class="label">Status inbox</div><div>${list((scheduler.statusInbox || []).map(eventLabel))}</div>
    <div class="label">Runtime events</div><div>${list(events.map((event) => `${event.type}: ${event.message || event.boardId || ""}`))}</div>
  </div>`;
}

function receiptView(receipts) {
  if (!receipts.length) return `<p class="empty">No receipts yet.</p>`;
  return `<table>
    <thead><tr><th style="width: 90px">Task</th><th>Summary</th><th>Verification</th></tr></thead>
    <tbody>${receipts.map((receipt) => `<tr><td><code>${escapeHtml(receipt.taskId)}</code></td><td>${escapeHtml(receipt.summary)}</td><td>${escapeHtml(receipt.verification)}</td></tr>`).join("")}</tbody>
  </table>`;
}

function dispatchPlanView(plans) {
  if (!plans.length) return `<p class="empty">No code dispatch plans recorded yet.</p>`;
  return `<table>
    <thead><tr><th style="width: 80px">Plan</th><th style="width: 145px">Route</th><th style="width: 140px">Status</th><th>Objective</th><th>Ownership</th><th style="width: 155px">Verification</th><th style="width: 120px">Missing</th></tr></thead>
    <tbody>${plans.map((plan) => `<tr>
      <td><code>${escapeHtml(plan.id)}</code></td>
      <td>${escapeHtml(plan.route)}</td>
      <td><span class="pill">${escapeHtml(plan.status)}</span></td>
      <td>${escapeHtml(plan.objective)}</td>
      <td>${escapeHtml(plan.ownership || (plan.allowedFiles || []).join(", ") || plan.domain || plan.workerId || "")}</td>
      <td>${escapeHtml((plan.verification || []).join(", "))}</td>
      <td>${escapeHtml((plan.missing || []).join(", "))}</td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function workerView(workers) {
  if (!workers.length) return `<p class="empty">No workers assigned yet.</p>`;
  return `<table>
    <thead><tr><th style="width: 70px">Worker</th><th style="width: 120px">Type</th><th style="width: 150px">Domain</th><th style="width: 80px">Owns</th><th style="width: 135px">Status</th><th style="width: 95px">Open Tasks</th><th style="width: 135px">Blocked By</th><th>Thread / Ledger</th><th>Root Action</th></tr></thead>
    <tbody>${workers.map((worker) => `<tr>
      <td><code>${escapeHtml(worker.id)}</code></td>
      <td>${escapeHtml(worker.workerType)}</td>
      <td>${escapeHtml(worker.domain || "unscoped")}</td>
      <td>${worker.ownsDomain ? "yes" : "no"}</td>
      <td><span class="pill">${escapeHtml(worker.status)}</span></td>
      <td>${escapeHtml(openDomainTaskCount(worker))}</td>
      <td>${escapeHtml(blockedByLabel(worker))}</td>
      <td>${worker.thread ? `<div><code>${escapeHtml(worker.thread)}</code></div>` : ""}${worker.childLedger ? `<div><code>${escapeHtml(worker.childLedger)}</code></div>` : ""}</td>
      <td>${escapeHtml(worker.rootActionNeeded || "")}</td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function blockerList(blockers) {
  if (!blockers.length) return `<span class="empty">None</span>`;
  return `<ul>${blockers.map((blocker) => {
    if (blocker.waitId) {
      return `<li><code>${escapeHtml(blocker.waitId)}</code> ${escapeHtml(blocker.reason || "Waiting")} until ${escapeHtml(blocker.nextCheckAt || "unknown")}</li>`;
    }
    if (blocker.nodeId) {
      return `<li><code>${escapeHtml(blocker.nodeId)}</code> ${escapeHtml(blocker.title || "node")}: ${escapeHtml(blocker.blockedReason || blocker.rootActionNeeded || "Human response needed.")}</li>`;
    }
    return `<li><code>${escapeHtml(blocker.workerId)}</code> ${escapeHtml(blocker.domain || "unscoped")}: ${escapeHtml(blocker.blockedReason || blocker.rootActionNeeded || "Human response needed.")}</li>`;
  }).join("")}</ul>`;
}

function eventLabel(event) {
  return `${event.type || "event"} ${event.workerId || ""} ${event.state || event.status || ""} ${event.rootActionNeeded || event.message || ""}`.trim();
}

function pollingSummary(polling) {
  if (polling.status === "idle") return "No work to poll; waiting for new human input.";
  if (polling.status === "paused-human") return "Waiting for a human response to known blocked work.";
  if (polling.status === "waiting-external") return "Waiting for a timed or external event.";
  return "Runtime has actionable work or is checking due waits.";
}

function externalWaitList(waits) {
  const active = waits.filter((wait) => wait.status === "waiting");
  if (!active.length) return `<span class="empty">None</span>`;
  return `<ul>${active.map((wait) => `<li><code>${escapeHtml(wait.id)}</code> ${escapeHtml(wait.reason)}; next check ${escapeHtml(wait.nextCheckAt)}</li>`).join("")}</ul>`;
}

function blockedByLabel(worker) {
  if (!worker.blockedBy && !worker.humanResponseNeeded) return "";
  const suffix = worker.humanResponseNeeded ? "human response needed" : "";
  return [worker.blockedBy, suffix].filter(Boolean).join("; ");
}

function openDomainTaskCount(worker) {
  return (worker.domainTasks || []).filter((task) =>
    !["done", "parked", "canceled"].includes(task.status)
  ).length;
}

function traceView(goal, plan, board, ledger, tasks) {
  if (!goal || !plan || !board || !ledger) return `<p class="empty">Trace appears after plan compilation.</p>`;
  return `<table>
    <thead><tr><th>Goal</th><th>Plan</th><th>Board Task</th><th>Runtime</th><th>Receipt</th></tr></thead>
    <tbody>${tasks.map((task) => `<tr>
      <td><code>${escapeHtml(goal.id)}</code></td>
      <td><code>${escapeHtml(plan.id)}</code></td>
      <td><code>${escapeHtml(task.id)}</code> ${escapeHtml(task.objective)}</td>
      <td><code>${escapeHtml(ledger.id)}</code></td>
      <td>${task.receipt ? escapeHtml(task.receipt.summary || "recorded") : "pending"}</td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function sendJson(response, payload) {
  response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function list(values) {
  const input = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!input.length) return `<span class="empty">None</span>`;
  return `<ul>${input.map((value) => `<li>${escapeHtml(String(value))}</li>`).join("")}</ul>`;
}

function last(values) {
  return values[values.length - 1] || null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
