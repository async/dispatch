# @async/dispatch API Surface Ledger

This file is the generated review ledger for semantic API contract features. It is current-state contract documentation, not a changelog or tutorial.

## Dispatch Runtime Scheduler

Contract: `@async/dispatch.runtime-scheduler`

### Events

| Feature | Title | Release | Stability | Lifecycle | Replacement | Docs |
| --- | --- | --- | --- | --- | --- | --- |
| `runtime.external-wait` | Explicit external wait records with resume metadata | internal | preview | active |  |  |
| `runtime.human-wake` | Human wake event for idle runtimes | internal | preview | active |  |  |

### Polling

| Feature | Title | Release | Stability | Lifecycle | Replacement | Docs |
| --- | --- | --- | --- | --- | --- | --- |
| `scheduler.idle` | Event-driven idle polling state | internal | preview | active |  |  |
| `scheduler.paused-human` | Human-specific paused polling state | internal | preview | active |  |  |
| `scheduler.waiting-external` | Timed external wait polling state | internal | preview | active |  |  |

## Dispatch Recursive Workflow Nodes

Contract: `@async/dispatch.workflow-nodes`

### Human

| Feature | Title | Release | Stability | Lifecycle | Replacement | Docs |
| --- | --- | --- | --- | --- | --- | --- |
| `node.direction-gate` | Human direction gate schema with bounded options | internal | preview | active |  |  |
| `node.human-blocker` | Context-rich human blocker schema | internal | preview | active |  |  |

### Model

| Feature | Title | Release | Stability | Lifecycle | Replacement | Docs |
| --- | --- | --- | --- | --- | --- | --- |
| `node.containment` | V1 recursive node containment policy | internal | preview | active |  |  |
| `node.overlay` | Workflow nodes as structure overlay linked to execution records | internal | preview | active |  |  |
| `node.status-aggregation` | Parent status aggregation from child nodes | internal | preview | active |  |  |

### Receipts

| Feature | Title | Release | Stability | Lifecycle | Replacement | Docs |
| --- | --- | --- | --- | --- | --- | --- |
| `node.receipt-ref` | Node receipt references backed by append-only receipt bodies | internal | preview | active |  |  |

## Dispatch CLI

Contract: `@async/dispatch.cli`

### Nodes

| Feature | Title | Release | Stability | Lifecycle | Replacement | Docs |
| --- | --- | --- | --- | --- | --- | --- |
| `cli.node-show` | node show inspection command | internal | preview | active |  |  |
| `cli.node-tree` | node tree inspection command | internal | preview | active |  |  |

### Runtime

| Feature | Title | Release | Stability | Lifecycle | Replacement | Docs |
| --- | --- | --- | --- | --- | --- | --- |
| `cli.runtime-plan-code` | runtime plan-code command with node linkage | internal | preview | active |  |  |
| `cli.runtime-wait` | runtime wait command | internal | preview | active |  |  |
| `cli.runtime-wake` | runtime wake command | internal | preview | active |  |  |

### Skills

| Feature | Title | Release | Stability | Lifecycle | Replacement | Docs |
| --- | --- | --- | --- | --- | --- | --- |
| `cli.skills-check` | skills check command for bundled skill validation | internal | preview | active |  |  |
| `cli.skills-install` | skills install command for installing bundled Codex skills | internal | preview | active |  |  |
| `cli.skills-json` | JSON output for skill automation commands | internal | preview | active |  |  |
| `cli.skills-list` | skills list command for bundled Codex skills | internal | preview | active |  |  |
| `cli.skills-path` | skills path command for bundled skill discovery | internal | preview | active |  |  |
| `cli.skills-status` | skills status command for installed Codex skill state | internal | preview | active |  |  |

## Dispatch Console

Contract: `@async/dispatch.console`

### Work

| Feature | Title | Release | Stability | Lifecycle | Replacement | Docs |
| --- | --- | --- | --- | --- | --- | --- |
| `console.work-api` | Machine-readable work discovery endpoint | internal | preview | active |  |  |
| `console.work-discovery` | Console discovers absolute root runtimes and dependent work | internal | preview | active |  |  |

## Supported Surfaces

| Contract | Hash | Features |
| --- | --- | --- |
| `@async/dispatch.cli` | `sha256:907a0c574b6d413a7fb4fbacda207693419211b057da5b0177cbe82170f01191` | `cli.node-show`, `cli.node-tree`, `cli.runtime-plan-code`, `cli.runtime-wait`, `cli.runtime-wake`, `cli.skills-check`, `cli.skills-install`, `cli.skills-json`, `cli.skills-list`, `cli.skills-path`, `cli.skills-status` |
| `@async/dispatch.console` | `sha256:5675b66d40b533f97ca5bcc3ef02b96f556e9837d8446c0ca1580da9b36e74fe` | `console.work-api`, `console.work-discovery` |
| `@async/dispatch.runtime-scheduler` | `sha256:a0e978da17bdf3d2282467aca75893af520864464b742d6bfe7113117d10f9be` | `runtime.external-wait`, `runtime.human-wake`, `scheduler.idle`, `scheduler.paused-human`, `scheduler.waiting-external` |
| `@async/dispatch.workflow-nodes` | `sha256:d18b09c5e204068c5da38d446243bcff0a9fd8a3fc1f353e1994fbeb7e3e435c` | `node.containment`, `node.direction-gate`, `node.human-blocker`, `node.overlay`, `node.receipt-ref`, `node.status-aggregation` |
