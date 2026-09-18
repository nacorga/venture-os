---
name: eval-run
description: Execute one isolated Venture OS benchmark run from its run ID. Use manually after /eval-new in a fresh Claude Code session.
argument-hint: <run-id>
disable-model-invocation: true
---

# Eval Run

Run ID: `$ARGUMENTS`

If no run ID was provided, stop and show:

```text
/eval-run <run-id>
```

Set `<run-dir>` to `evals/runs/$ARGUMENTS`.

## Isolation rule

The run must measure discovery, not reproduction.

During this skill:

- read only the active run's `case.yaml`, its own artifacts, relevant framework files, agents, and normal Venture OS skills;
- never read `evals/reference/`;
- never inspect git history, prior eval runs, or other Case Library entries for expected answers;
- external market research is allowed;
- if reference expectations are already present in context, stop and report the run as contaminated instead of continuing.

## Workflow

1. Read `<run-dir>/case.yaml` and `<run-dir>/metadata.json`.
2. Use `<run-dir>/venture/` as the target venture directory.
3. Apply `venture-new` from the seed idea without doing research in that step.
4. Apply `venture-research` against the critical assumptions.
5. Apply `venture-challenge` adversarially.
6. Apply `venture-decide` and persist the gate decision.
7. If the decision's `next_action` is an experiment (`type: experiment`), apply `venture-experiment` for the assumption it targets and run `npm run experiment:lock -- <path-to-experiment.yaml>`. Leave the experiment `designed`: the run ends before anything is executed. Freeze refuses a run whose decision chose an experiment that was never designed and locked with routed success and failure outcomes, because a later result could not be checked against it.
8. Create `<run-dir>/RESULT.md` as a projection of canonical `venture.yaml`, not as a second independently authored state. Include:
   - gate outcome;
   - critical assumptions identified;
   - strongest supporting evidence;
   - strongest contradictory evidence;
   - blocking uncertainties;
   - the decision-time next action from `latest_decision.snapshot`, copied without paraphrase; when step 7 has since replaced the current `next_action`, name that current action separately and say it executes the snapshot's decision;
   - do-not-build items referenced by `DNB###` ID;
   - revisit triggers referenced by `T###` ID when applicable;
   - concise retrospective on where confidence remains weak.
9. Include the same immutable projection shape used by `templates/decision.md`: `decision_id`, `outcome`, and the full `latest_decision.snapshot`. Copy the snapshot exactly; do not reconstruct it from current operational fields.
10. Run `npm run evidence:check -- <run-dir>/venture` after `RESULT.md` exists so projection drift is caught before freeze.
11. Do not score the run and do not read evaluator references.

## Completion criteria

The venture directory is internally consistent, the decision is auditable, `RESULT.md` matches the immutable decision snapshot, and the consistency checker passes.

Finish by telling the user only the next canonical command:

```text
/eval-freeze $ARGUMENTS
```

Do not reproduce the freeze procedure in prose; `eval-freeze` owns it.
