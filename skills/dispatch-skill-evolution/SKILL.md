---
name: dispatch-skill-evolution
description: Evolve repo-local async-dispatch skills before updating installed Codex skills. Use when drafting, reviewing, validating, or promoting Dispatch workflow skills that will eventually replace or update personal skills such as root-chat coordination, code routing, idle runtime handling, or domain-owner workflows.
---

# Dispatch Skill Evolution

## Overview

Keep new Dispatch workflow skills repo-local until the CLI behavior, tests, and real usage prove the workflow. Promote to installed skills only after validation and an explicit decision.

## Workflow

1. Prototype in this repo.
   - Create skills under `skills/<skill-name>/`.
   - Keep each skill focused on one job.
   - Prefer instructions that call `async-dispatch` instead of duplicating runtime state rules.
   - Preserve the framing that Dispatch is a small state-machine and queue runtime, not a broad job system.
   - When borrowing from GoalBuddy, ADR-style decision records, or another local workflow, encode the reusable rule as a Dispatch lesson first; do not copy installed skill layout or generated artifacts into Dispatch.

2. Keep skill bodies concise.
   - Put trigger conditions in YAML `description`.
   - Keep `SKILL.md` procedural and under 500 lines.
   - Add references only when the core body would become too large.
   - Do not add README, changelog, or install notes inside a skill folder.

3. Validate locally.
   - Run the `quick_validate.py` script from the system `skill-creator` skill against `skills/<skill-name>`.
   - Run repo tests when the skill depends on current CLI behavior.
   - Fix validation problems before considering install or promotion.

4. Forward-test before promotion when behavior is complex.
   - Use realistic prompts against the repo-local skill.
   - Pass the skill path and task, not hidden expected answers.
   - Verify whether a fresh agent discovers the right workflow.

5. Promote deliberately.
   - Update installed skills only after the repo-local skill is validated and the human approves.
   - Keep repo and installed copies clearly separated during promotion.
   - After installing, run a fresh-thread discoverability check.

6. Feed lessons back into the workflow.
   - Start from concrete evidence: receipts, blockers, failed verification, reroutes, waits, or user corrections.
   - Promote only reusable rules, not one-off annoyance notes.
   - Prefer runtime tests or CLI behavior changes before skill text when the lesson changes Dispatch semantics.

## Promotion Checklist

- [ ] Repo-local `SKILL.md` has no unfinished template markers.
- [ ] `agents/openai.yaml` matches the final skill purpose.
- [ ] `quick_validate.py` passes.
- [ ] Any Dispatch CLI commands referenced by the skill are implemented and tested.
- [ ] The skill preserves the state-machine/queue framing for runtime behavior.
- [ ] The skill was used or forward-tested on a realistic workflow.
- [ ] Lessons learned are tied to concrete evidence and have a follow-up path.
- [ ] Installed skill update is explicitly requested.
