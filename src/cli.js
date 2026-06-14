#!/usr/bin/env node
import { startConsole } from "./console-server.js";
import { renderHumanDraftTemplate, renderReferenceMapTemplate } from "./draft-template.js";
import {
  addPlanDecision,
  addNode,
  addNodeDecisionGate,
  addNodeReceipt,
  addWorkerDomainTask,
  addContext,
  appendReceipt,
  appendRuntimeEvent,
  approveBoard,
  assignWorker,
  closeWorkerDomain,
  completeWorkerDomainTask,
  compilePlan,
  decideNodeGate,
  draftPlan,
  enrichPlan,
  initGoal,
  loadSnapshot,
  markPlanReady,
  blockNodeForHuman,
  clearExternalWait,
  passNode,
  recordCodeDispatchPlan,
  recordExternalWait,
  recordHumanResponse,
  recordRuntimeWake,
  refineGoal,
  renderNodeTree,
  resolvePlanDecision,
  reviewPlan,
  showNode,
  startRuntime,
  updateNodeStatus,
  updateWorkerStatus
} from "./model.js";
import { resolveHome } from "./store.js";

const home = resolveHome();

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

async function main(argv) {
  const [domain, action, subject, ...rest] = argv;
  if (!domain || domain === "help" || domain === "--help") {
    printHelp();
    return;
  }
  if (domain === "console") {
    const flags = parseFlags(argv.slice(1));
    const port = Number(flags.port || 8787);
    const { url } = await startConsole({ home, port, host: flags.host || "127.0.0.1" });
    console.log(`Async Dispatch Console: ${url}`);
    return new Promise(() => {});
  }
  if (domain === "snapshot") {
    console.log(JSON.stringify(await loadSnapshot(home), null, 2));
    return;
  }
  const flags = parseFlags([subject, ...rest].filter(Boolean));

  if (domain === "goal" && action === "init") {
    const goal = await initGoal(home, { seed: flags.seed });
    printObject("Goal created", { goalId: goal.id, path: `${home}/goals/${goal.id}/goal.json` });
    return;
  }
  if (domain === "goal" && action === "refine") {
    const { goal, decision } = await refineGoal(home, subject, flags);
    printObject("Goal refined", { goalId: goal.id, decisionAt: decision.at });
    return;
  }
  if (domain === "context" && action === "add") {
    const event = await addContext(home, subject, flags);
    printObject("Context added", { goalId: event.goalId, at: event.at });
    return;
  }
  if (domain === "plan" && action === "draft") {
    const plan = await draftPlan(home, subject, { from: flags.from, title: flags.title });
    printObject("Plan drafted", { planId: plan.id, goalId: plan.goalId });
    return;
  }
  if (domain === "plan" && action === "template") {
    const template = subject || "human-draft";
    if (template === "human-draft") {
      console.log(renderHumanDraftTemplate({ originalSeed: flags.seed || "[raw goal seed]" }));
      return;
    }
    if (template === "reference-map") {
      console.log(renderReferenceMapTemplate({ originalSeed: flags.seed || "[raw goal seed]" }));
      return;
    }
    throw new Error(`Unknown plan template: ${template}`);
  }
  if (domain === "plan" && action === "review") {
    const { plan, event } = await reviewPlan(home, subject, flags);
    printObject("Plan reviewed", { planId: plan.id, status: plan.status, at: event.at });
    return;
  }
  if (domain === "plan" && action === "decision") {
    const { plan, event } = await addPlanDecision(home, subject, flags);
    printObject("Plan decision recorded", {
      planId: plan.id,
      decisionId: event.decisionId,
      status: plan.status,
      decisionAt: event.at
    });
    return;
  }
  if (domain === "plan" && action === "resolve") {
    const { plan, event } = await resolvePlanDecision(home, subject, flags);
    printObject("Plan decision resolved", {
      planId: plan.id,
      decisionId: event.decisionId,
      status: plan.status,
      resolvedAt: event.at
    });
    return;
  }
  if (domain === "plan" && action === "enrich") {
    const plan = await enrichPlan(home, subject, flags);
    printObject("Plan enriched", {
      planId: plan.id,
      status: plan.status,
      sourceIds: plan.sourceIds.length,
      sections: plan.sections.length
    });
    return;
  }
  if (domain === "plan" && action === "ready") {
    const plan = await markPlanReady(home, subject, flags);
    printObject("Plan ready", { planId: plan.id, status: plan.status, readyAt: plan.readyAt });
    return;
  }
  if (domain === "plan" && action === "compile") {
    const { board } = await compilePlan(home, subject);
    printObject("Plan board created", { boardId: board.id, status: board.status });
    return;
  }
  if (domain === "board" && action === "approve") {
    const board = await approveBoard(home, subject, flags);
    printObject("Plan board approved", { boardId: board.id, status: board.status, approvedAt: board.approvedAt });
    return;
  }
  if (domain === "runtime" && action === "start") {
    const { board, ledger } = await startRuntime(home, subject);
    printObject("Runtime started", { boardId: board.id, ledgerId: ledger.id });
    return;
  }
  if (domain === "runtime" && action === "human-response") {
    const { ledger, event } = await recordHumanResponse(home, subject, flags);
    printObject("Human response recorded", {
      ledgerId: subject,
      status: ledger.scheduler.polling.status,
      workerIds: event.workerIds.join(", "),
      at: event.at
    });
    return;
  }
  if (domain === "runtime" && action === "wake") {
    const { ledger, event } = await recordRuntimeWake(home, subject, flags);
    printObject("Runtime woke", {
      ledgerId: subject,
      status: ledger.scheduler.polling.status,
      event: event.type,
      at: event.at
    });
    return;
  }
  if (domain === "runtime" && action === "plan-code") {
    const { ledger, plan } = await recordCodeDispatchPlan(home, subject, flags);
    printObject("Code dispatch planned", {
      ledgerId: subject,
      planId: plan.id,
      route: plan.route,
      status: plan.status,
      missing: plan.missing.join(", "),
      polling: ledger.scheduler.polling.status
    });
    return;
  }
  if (domain === "runtime" && action === "wait") {
    const { ledger, wait } = await recordExternalWait(home, subject, flags);
    printObject("External wait recorded", {
      ledgerId: subject,
      waitId: wait.id,
      status: ledger.scheduler.polling.status,
      nextCheckAt: wait.nextCheckAt
    });
    return;
  }
  if (domain === "runtime" && action === "clear-wait") {
    const { ledger, event } = await clearExternalWait(home, subject, flags);
    printObject("External wait cleared", {
      ledgerId: subject,
      status: ledger.scheduler.polling.status,
      waitIds: event.waitIds.join(", "),
      at: event.at
    });
    return;
  }
  if (domain === "node" && action === "add") {
    const { node, ledger } = await addNode(home, subject, flags);
    printObject("Node added", {
      ledgerId: subject,
      nodeId: node.id,
      kind: node.kind,
      status: node.status,
      polling: ledger.scheduler.polling.status
    });
    return;
  }
  if (domain === "node" && action === "status") {
    const { node, ledger } = await updateNodeStatus(home, subject, flags);
    printObject("Node status recorded", {
      ledgerId: subject,
      nodeId: node.id,
      status: node.status,
      polling: ledger.scheduler.polling.status
    });
    return;
  }
  if (domain === "node" && action === "gate") {
    const { node, ledger } = await addNodeDecisionGate(home, subject, flags);
    printObject("Decision gate added", {
      ledgerId: subject,
      nodeId: node.id,
      status: node.status,
      recommended: node.decisionGate.recommendedOptionId,
      polling: ledger.scheduler.polling.status
    });
    return;
  }
  if (domain === "node" && action === "decide") {
    const { node, ledger } = await decideNodeGate(home, subject, flags);
    printObject("Decision recorded", {
      ledgerId: subject,
      nodeId: node.id,
      decision: node.decisionGate.decisionOptionId,
      status: node.status,
      polling: ledger.scheduler.polling.status
    });
    return;
  }
  if (domain === "node" && action === "block-human") {
    const { node, ledger } = await blockNodeForHuman(home, subject, flags);
    printObject("Node blocked on human", {
      ledgerId: subject,
      nodeId: node.id,
      status: node.status,
      blockedThing: node.humanBlocker.blockedThing,
      polling: ledger.scheduler.polling.status
    });
    return;
  }
  if (domain === "node" && action === "receipt") {
    const { node, receipt, ledger } = await addNodeReceipt(home, subject, flags);
    printObject("Node receipt recorded", {
      ledgerId: subject,
      nodeId: node.id,
      receiptId: receipt.receiptId,
      status: node.status,
      polling: ledger.scheduler.polling.status
    });
    return;
  }
  if (domain === "node" && action === "pass") {
    const { node, ledger } = await passNode(home, subject, flags);
    printObject("Node passed", {
      ledgerId: subject,
      nodeId: node.id,
      status: node.status,
      polling: ledger.scheduler.polling.status
    });
    return;
  }
  if (domain === "node" && action === "show") {
    console.log(JSON.stringify(await showNode(home, subject, flags), null, 2));
    return;
  }
  if (domain === "node" && action === "tree") {
    console.log(await renderNodeTree(home, subject, flags));
    return;
  }
  if (domain === "worker" && action === "assign") {
    const { worker } = await assignWorker(home, subject, flags);
    printObject("Worker assigned", {
      ledgerId: subject,
      workerId: worker.id,
      workerType: worker.workerType,
      domain: worker.domain,
      ownsDomain: worker.ownsDomain,
      status: worker.status
    });
    return;
  }
  if (domain === "worker" && action === "task") {
    const { worker, task } = await addWorkerDomainTask(home, subject, flags);
    printObject("Domain task added", {
      ledgerId: subject,
      workerId: worker.id,
      taskId: task.id,
      domain: worker.domain,
      status: worker.status
    });
    return;
  }
  if (domain === "worker" && action === "status") {
    const { worker, event } = await updateWorkerStatus(home, subject, flags);
    printObject("Worker status recorded", {
      ledgerId: subject,
      workerId: worker.id,
      state: event.state,
      status: worker.status,
      rootActionNeeded: worker.rootActionNeeded
    });
    return;
  }
  if (domain === "worker" && action === "complete-task") {
    const { worker, task } = await completeWorkerDomainTask(home, subject, flags);
    printObject("Domain task completed", {
      ledgerId: subject,
      workerId: worker.id,
      taskId: task.id,
      status: worker.status
    });
    return;
  }
  if (domain === "worker" && action === "close-domain") {
    const { worker } = await closeWorkerDomain(home, subject, flags);
    printObject("Domain closed", {
      ledgerId: subject,
      workerId: worker.id,
      domain: worker.domain,
      status: worker.status
    });
    return;
  }
  if (domain === "event" && action === "add") {
    const event = await appendRuntimeEvent(home, subject, flags);
    printObject("Runtime event recorded", { ledgerId: subject, at: event.at });
    return;
  }
  if (domain === "receipt" && action === "add") {
    const receipt = await appendReceipt(home, subject, flags);
    printObject("Receipt recorded", { ledgerId: subject, taskId: receipt.taskId, at: receipt.at });
    return;
  }
  throw new Error(`Unknown command: ${argv.join(" ")}`);
}

function parseFlags(args) {
  const flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = toCamel(arg.slice(2));
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    if (flags[key] === undefined) {
      flags[key] = next;
    } else if (Array.isArray(flags[key])) {
      flags[key].push(next);
    } else {
      flags[key] = [flags[key], next];
    }
    index += 1;
  }
  return flags;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function printObject(label, value) {
  console.log(label);
  for (const [key, item] of Object.entries(value)) {
    console.log(`${key}: ${item}`);
  }
}

function printHelp() {
  console.log(`async-dispatch

Goal-first local coordination.

Commands:
  goal init --seed "..."
  goal refine <goalId> --statement "..." --success-proof "..." --why "..."
  context add <goalId> --note "..."
  plan draft <goalId> [--from draft.md] [--title "..."]
  plan template [human-draft|reference-map] [--seed "..."]
  plan review <planId> [--decision approved] [--note "..."]
  plan decision <planId> --note "..." [--section-id S018] [--source-id G-11]
  plan enrich <planId> [--note "..."]    Refresh draft parse/reference map after human edits
  plan resolve <planId> --decision-id D001 --resolution "..."
  plan ready <planId> [--note "..."]     Mark the draft loop ready for board compilation
  plan compile <planId>              Create the pre-runtime draft/plan board
  board approve <boardId> [--note "..."]
  runtime start <boardId>            Create the runtime ledger after board review
  runtime human-response <ledgerId> --note "..." [--worker-id W001]
  runtime wake <ledgerId> --note "..." Human input wakes an idle runtime
  runtime plan-code <ledgerId> --objective "..." --route root|subagent|subagent-worktree|domain-owner-chat|child-chat [--node-id N001] [--domain "..."] [--ownership "..."] [--allowed-file path] [--verify "..."]
  runtime wait <ledgerId> --next-check-at "..." [--reason "..."] [--worker-id W001] [--node-id N001]
  runtime clear-wait <ledgerId> [--wait-id EW001] [--note "..."]
  node add <ledgerId> --kind phase|loop|checkpoint|milestone|task|lane|gate|lesson --title "..." [--parent-id N001] [--required-receipt tests]
  node gate <ledgerId> --parent-id N001 --question "..." --option "..." --option "..." [--option "..."] [--recommended 1]
  node decide <ledgerId> --node-id N002 --option O1 [--reason "..."]
  node block-human <ledgerId> --node-id N003 --blocked-thing "..." --why-blocked "..." [--attempted "..."] [--option "..."] [--recommended 1] [--resume-after-answer "..."]
  node receipt <ledgerId> --node-id N003 --summary "..." --verification "..." [--requirement tests]
  node pass <ledgerId> --node-id N001 [--receipt R001]
  node show <ledgerId> --node-id N001
  node tree <ledgerId> [--node-id N001]
  worker assign <ledgerId> --domain "pipeline" --owns-domain true --worker-type nested-root --task "..."
  worker task <ledgerId> --worker-id W001 --objective "..."
  worker status <ledgerId> --worker-id W001 --state blocked --blocked-by human --message "..."
  worker status <ledgerId> --worker-id W001 --state idle
  worker complete-task <ledgerId> --worker-id W001 --task-id DT001 --summary "..." --verification "..."
  worker close-domain <ledgerId> --worker-id W001 --note "..."
  event add <ledgerId> --message "..."
  receipt add <ledgerId> --task-id T001 --summary "..." --verification "..."
  console [--port 8787]
  snapshot
`);
}
