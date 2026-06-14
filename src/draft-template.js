export function renderHumanDraftTemplate(goal = {}) {
  const originalSeed = goal.originalSeed || "[raw goal seed]";
  const refined = goal.refined || {};
  const statement = refined.statement || "[refined goal statement]";
  const purpose = refined.purpose || "[purpose / bigger picture]";
  const successProof = refined.successProof || "[success proof / oracle]";
  const constraints = formatList(refined.constraints, "[constraint]");
  const nonGoals = formatList(refined.nonGoals, "[non-goal]");
  const openQuestions = formatList(refined.openQuestions, "[open question]");
  const contextGathered = formatList(refined.contextGathered, "[context note]");

  return `# ${originalSeed} Draft

Draft scope: [domains, repos, systems, user flows, or decisions in scope].

This is a high-level task map. Each bullet is intentionally goal-sized and can
be split into implementation tasks later.

## Goal Seed

Original goal seed: ${originalSeed}

## Refined Goal Charter

- Refined goal: ${statement}
- Purpose / bigger picture: ${purpose}
- Success proof / oracle: ${successProof}
- Constraints:
${constraints}
- Non-goals:
${nonGoals}
- Open questions:
${openQuestions}
- Context gathered:
${contextGathered}

## Cross-Domain Goals

1. [Name the first cross-domain goal].
   - [What must become true.]
   - [What should stop happening.]
   - [How this goal will be proven.]

2. [Name the second cross-domain goal].
   - [What must become true.]
   - [Important constraints or edge cases.]
   - [How this goal will be proven.]

3. [Name the third cross-domain goal].
   - [What must become true.]
   - [Important constraints or edge cases.]
   - [How this goal will be proven.]

## \`[domain-a]\`

1. [First domain outcome].
   - [Goal-sized implementation direction.]
   - [Expected verification or receipt.]

2. [Second domain outcome].
   - [Goal-sized implementation direction.]
   - [Expected verification or receipt.]

## \`[domain-b]\`

1. [First domain outcome].
   - [Goal-sized implementation direction.]
   - [Expected verification or receipt.]

2. [Second domain outcome].
   - [Goal-sized implementation direction.]
   - [Expected verification or receipt.]

## Execution Order

1. [Foundation or shared capability that must happen first].
2. [Smallest low-risk domain to prove the pattern].
3. [Next domain or dependency layer].
4. [Larger or riskier domain].
5. [Final external verification and settings].

The exact order can change if discovery finds dependency or state constraints,
but changes should be recorded as draft review decisions before compilation.

## Missing Or Easy-To-Miss Work

1. [External setting or permission that is easy to forget.]
2. [Docs or command drift that should be searched explicitly.]
3. [Metadata, packaging, API, or integration surface to verify.]
4. [Cleanup, retention, migration, or rollback policy.]
5. [A fallback policy for anything the system cannot express yet.]

## Review Questions

1. [Question the human must answer before board compilation.]
2. [Tradeoff or ordering question.]
3. [Scope or non-goal question.]

## Ready-To-Compile Checklist

- [ ] Goal charter matches the current intent.
- [ ] Human review comments are recorded.
- [ ] Reference map enrichment is complete, if this work needs stable IDs.
- [ ] Review comments are resolved or accepted.
- [ ] Open questions are either answered or explicitly deferred.
- [ ] The next step is board compilation, not runtime execution.
`;
}

export function renderReferenceMapTemplate(goal = {}) {
  const originalSeed = goal.originalSeed || "[raw goal seed]";

  return `# ${originalSeed} Reference Map Enrichment

Use this after the human-readable draft is directionally right. Do not replace
the draft; append or merge these IDs so later boards can trace work back to the
reviewed human plan.

## Reference Map

Use these IDs when planning, filing issues, or handing work to domain-specific
root chats, child chats, or workers.

### Cross-Domain Goal IDs

| ID | Goal |
| --- | --- |
| \`G-1\` | [goal-sized outcome that applies across domains] |
| \`G-2\` | [second cross-domain outcome] |
| \`G-3\` | [third cross-domain outcome] |

### Domain / Repo Workstream IDs

| Domain / Repo | IDs |
| --- | --- |
| \`[domain-a]\` | \`DA-1\` [workstream], \`DA-2\` [workstream], \`DA-3\` [workstream] |
| \`[domain-b]\` | \`DB-1\` [workstream], \`DB-2\` [workstream], \`DB-3\` [workstream] |

## Detailed Execution Plan

### Phase 0: Baseline And Context Audit

Goal: establish the real starting point before any edits or worker chats.
References: \`G-1\`, \`G-2\`.

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
References: \`G-1\`, \`DA-1\`.

1. [Foundation task].
   - [Implementation direction.]
   - [Verification.]

Phase 1 exit criteria:
- [Foundation is available.]
- [The first proof works.]
- [Known gaps are captured as TODOs or non-goals.]

### Phase 2: Prove Smaller Or Lower-Risk Domains

Goal: validate the pattern before touching larger or riskier domains.
References: \`DA-2\`, \`DB-1\`.

1. [Migrate or implement first small domain].
   - [Implementation direction.]
   - [Verification.]

Phase 2 exit criteria:
- [The pattern works outside the foundation domain.]
- [Receipts can prove the change.]
- [Follow-up gaps are explicit.]

### Phase 3: Migrate Larger Or Higher-Risk Domains

Goal: apply the proven pattern to the domains with more blast radius.
References: \`G-2\`, \`DB-2\`.

1. [Large domain task].
   - [Preserve or isolate existing work first.]
   - [Implementation direction.]
   - [Verification.]

Phase 3 exit criteria:
- [All target domains satisfy the goal.]
- [No hidden fallback remains without a tracked reason.]

### Phase 4: External Verification And Settings

Goal: catch requirements that do not live in code or local files.
References: \`G-3\`.

1. Verify external settings.
   - [Settings, permissions, secrets, environments, or service config.]
   - [Evidence to capture.]

Phase 4 exit criteria:
- [Every external dependency is checked.]
- [Final receipts cite the verification evidence.]
- [The board can be closed without losing translation history.]
`;
}

function formatList(values, fallback) {
  const input = Array.isArray(values) ? values.filter(Boolean) : [];
  const list = input.length ? input : [fallback];
  return list.map((value) => `  - ${value}`).join("\n");
}
