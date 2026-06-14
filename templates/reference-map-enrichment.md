# [Goal Seed] Reference Map Enrichment

Use this after the human-readable draft is directionally right. Do not replace
the draft; append or merge these IDs so later boards can trace work back to the
reviewed human plan.

## Reference Map

Use these IDs when planning, filing issues, or handing work to domain-specific
root chats, child chats, or workers.

### Cross-Domain Goal IDs

| ID | Goal |
| --- | --- |
| `G-1` | [goal-sized outcome that applies across domains] |
| `G-2` | [second cross-domain outcome] |
| `G-3` | [third cross-domain outcome] |

### Domain / Repo Workstream IDs

| Domain / Repo | IDs |
| --- | --- |
| `[domain-a]` | `DA-1` [workstream], `DA-2` [workstream], `DA-3` [workstream] |
| `[domain-b]` | `DB-1` [workstream], `DB-2` [workstream], `DB-3` [workstream] |

## Detailed Execution Plan

### Phase 0: Baseline And Context Audit

Goal: establish the real starting point before any edits or worker chats.
References: `G-1`, `G-2`.

1. Snapshot each target domain.
   - [Current state command or observation.]
   - [Dirty state, ownership, or access risk.]
   - [Evidence to record before execution.]

Phase 0 exit criteria:
- [Evidence exists.]
- [Scope boundaries are explicit.]
- [Unknowns are either resolved or tracked as review questions.]

### Phase 1: Foundation Or Shared Capability

Goal: build the shared capability or decision needed before domain work starts.
References: `G-1`, `DA-1`.

1. [Foundation task].
   - [Implementation direction.]
   - [Verification.]

Phase 1 exit criteria:
- [Foundation is available.]
- [The first proof works.]
- [Known gaps are captured as TODOs or non-goals.]

### Phase 2: Prove Smaller Or Lower-Risk Domains

Goal: validate the pattern before touching larger or riskier domains.
References: `DA-2`, `DB-1`.

1. [Migrate or implement first small domain].
   - [Implementation direction.]
   - [Verification.]

Phase 2 exit criteria:
- [The pattern works outside the foundation domain.]
- [Receipts can prove the change.]
- [Follow-up gaps are explicit.]

### Phase 3: Migrate Larger Or Higher-Risk Domains

Goal: apply the proven pattern to the domains with more blast radius.
References: `G-2`, `DB-2`.

1. [Large domain task].
   - [Preserve or isolate existing work first.]
   - [Implementation direction.]
   - [Verification.]

Phase 3 exit criteria:
- [All target domains satisfy the goal.]
- [No hidden fallback remains without a tracked reason.]

### Phase 4: External Verification And Settings

Goal: catch requirements that do not live in code or local files.
References: `G-3`.

1. Verify external settings.
   - [Settings, permissions, secrets, environments, or service config.]
   - [Evidence to capture.]

Phase 4 exit criteria:
- [Every external dependency is checked.]
- [Final receipts cite the verification evidence.]
- [The board can be closed without losing translation history.]
