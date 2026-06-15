import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parsePackageContractManifest, renderApiSurfaceMarkdown } from "@async/api-contract";
import { checkClaims } from "@async/claims";
import { claimsTasks } from "@async/claims/pipeline";
import { definePipeline, job, readDeclaration, runJob, sh, task, tasksForJob } from "@async/pipeline";
import {
  addNode,
  addNodeReceipt,
  approveBoard,
  assignWorker,
  compilePlan,
  draftPlan,
  initGoal,
  markPlanReady,
  recordCodeDispatchPlan,
  recordRuntimeWake,
  showNode,
  startRuntime,
  updateWorkerStatus
} from "../src/model.js";
import { ledgerDir, readJson, readJsonl, writeJson } from "../src/store.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("PROMISE: recursive nodes stay an execution overlay linked by ids", async () => {
  const { home, ledger } = await runtimeFor("Overlay nodes stay linked to execution");
  await drainRootQueues(home, ledger.id);
  const phase = await addNode(home, ledger.id, {
    kind: "phase",
    title: "Implementation"
  });

  const planned = await recordCodeDispatchPlan(home, ledger.id, {
    nodeId: phase.node.id,
    route: "domain-owner-chat",
    domain: "runtime",
    objective: "Implement scheduler support",
    ownership: "src/model.js",
    verify: "pnpm test"
  });
  const receipt = await addNodeReceipt(home, ledger.id, {
    nodeId: phase.node.id,
    requirement: "implementation",
    summary: "Scheduler support is implemented.",
    verification: "pnpm test"
  });
  const shown = await showNode(home, ledger.id, { nodeId: phase.node.id });
  const receipts = await readJsonl(path.join(ledgerDir(home, ledger.id), "receipts.jsonl"));

  assert.equal(planned.plan.nodeId, phase.node.id);
  assert.deepEqual(shown.node.receiptRefs, [{ receiptId: receipt.receipt.receiptId, requirement: "implementation" }]);
  assert.equal(shown.receiptDetails[0].summary, "Scheduler support is implemented.");
  assert.equal(receipts.at(-1).nodeId, phase.node.id);
});

test("PROMISE: idle scheduler stops polling until human wake", async () => {
  const { home, ledger } = await runtimeFor("Idle runtime wakes on human input");
  await drainRootQueues(home, ledger.id);
  const assigned = await assignWorker(home, ledger.id, {
    workerType: "nested-root",
    ownsDomain: true,
    domain: "runtime"
  });
  const idle = await updateWorkerStatus(home, ledger.id, {
    workerId: assigned.worker.id,
    state: "idle"
  });

  assert.equal(idle.ledger.scheduler.polling.status, "idle");
  assert.equal(idle.ledger.scheduler.polling.resumeAfter, "runtime wake");

  const woke = await recordRuntimeWake(home, ledger.id, {
    note: "Human asked for the next dispatch."
  });

  assert.equal(woke.ledger.scheduler.polling.status, "active");
  assert.equal(woke.ledger.scheduler.statusInbox.at(-1).type, "human-wake");
});

test("PROMISE: async pipeline schedules test and code lanes in parallel", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dispatch-pipeline-parallel-"));
  try {
    await fs.writeFile(path.join(dir, "lane.js"), laneScript(), "utf8");
    const pipeline = definePipeline({
      name: "dispatch-parallel-lanes",
      tasks: {
        tests: task({ cache: false, run: sh`node lane.js tests code` }),
        code: task({ cache: false, run: sh`node lane.js code tests` })
      },
      jobs: {
        verify: job({ target: ["tests", "code"] })
      }
    });

    const record = await runJob(pipeline, {
      id: "verify",
      cwd: dir,
      env: { PATH: process.env.PATH },
      concurrency: 2,
      force: true
    });

    assert.equal(record.status, "passed");
    assert.deepEqual(record.tasks.map((entry) => entry.id).sort(), ["code", "tests"]);
  } finally {
    await fs.rm(dir, { force: true, recursive: true });
  }
});

test("claims workflow helper flattens into the Dispatch verification graph", () => {
  const claims = claimsTasks({
    registry: "tests/claims.json",
    testFiles: ["tests/**/*.test.js"],
    docs: ["README.md"],
    repair: false
  });
  const pipeline = definePipeline({
    name: "dispatch-helper-graph",
    tasks: {
      "runtime.test": task({ run: sh`pnpm test` }),
      "api.check": task({ run: sh`api-contract check --manifest api-contract.json` }),
      claims,
      "release.gate": task({
        dependsOn: ["runtime.test", "api.check", "claims"],
        run: sh`echo ready`
      })
    },
    jobs: {
      verify: job({ target: "release.gate" })
    }
  });
  const graph = tasksForJob(pipeline, "verify");
  const releaseGate = graph.tasks.find((entry) => entry.id === "release.gate");

  assert.deepEqual(readDeclaration(claims), { kind: "section.tasks", version: 1 });
  assert.ok(pipeline.tasks.claims.steps[0].command.includes("async-claims check"));
  assert.deepEqual(releaseGate.dependsOn, ["api.check", "claims", "runtime.test"]);
  assert.deepEqual(graph.tasks.find((entry) => entry.id === "claims").dependsOn, []);
  assert.deepEqual(graph.tasks.find((entry) => entry.id === "runtime.test").dependsOn, []);
});

test("async claims registry covers Dispatch README promises", async () => {
  const report = await checkClaims({
    cwd: repoRoot,
    registry: "tests/claims.json",
    testFiles: ["tests/**/*.test.js"]
  });

  assert.equal(report.ok, true, JSON.stringify(report.failures, null, 2));
});

test("api-contract ledger is current for Dispatch", async () => {
  const manifest = parsePackageContractManifest(JSON.parse(
    await fs.readFile(path.join(repoRoot, "api-contract.json"), "utf8")
  ));
  const expected = renderApiSurfaceMarkdown({ manifest });
  const actual = await fs.readFile(path.join(repoRoot, "API_SURFACE.md"), "utf8");

  assert.equal(actual, expected);
});

async function runtimeFor(seed) {
  const home = await tempHome();
  const goal = await initGoal(home, { seed });
  const plan = await draftPlan(home, goal.id, {});
  await markPlanReady(home, plan.id, { note: "Ready." });
  const { board } = await compilePlan(home, plan.id);
  await approveBoard(home, board.id, { note: "Approved." });
  const runtime = await startRuntime(home, board.id);
  return { home, ...runtime };
}

async function drainRootQueues(home, ledgerId) {
  const ledgerPath = path.join(ledgerDir(home, ledgerId), "ledger.json");
  const ledger = await readJson(ledgerPath);
  ledger.scheduler.callStack = "idle";
  ledger.scheduler.readyQueue = [];
  ledger.scheduler.statusInbox = [];
  await writeJson(ledgerPath, ledger);
}

async function tempHome() {
  return fs.mkdtemp(path.join(os.tmpdir(), "dispatch-helper-tools-"));
}

function laneScript() {
  return `
const fs = require("node:fs");
const [self, peer] = process.argv.slice(2);
const dir = "signals";
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(\`\${dir}/\${self}-started\`, String(Date.now()));
const deadline = Date.now() + 3000;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
while (!fs.existsSync(\`\${dir}/\${peer}-started\`)) {
  if (Date.now() > deadline) throw new Error(\`\${self} lane did not observe \${peer} lane start\`);
  sleep(25);
}
fs.writeFileSync(\`\${dir}/\${self}-done\`, "done\\n");
`;
}
