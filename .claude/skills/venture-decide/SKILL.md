---
name: venture-decide
description: Runs a Venture OS stage gate and records an auditable PROCEED, TEST, or PARK decision. Use after research and challenge artifacts exist or when new evidence materially changes the venture.
argument-hint: <venture-dir>
---

# Venture Decide

Target venture directory: `$ARGUMENTS`

Read `framework/gates.md`, the target venture state, all relevant evidence, and the latest challenge report.

Before invoking the gatekeeper:

1. invoke `evidence-auditor` when evidence quality, quantitative derivations, supersessions, framework claims, or segment transport could affect the decision;
2. run `npm run evidence:check -- $ARGUMENTS` against the target venture directory;
3. if the consistency check fails, repair the evidence graph/state before making a gate decision;
4. then invoke `gatekeeper`.

A failed consistency check is not itself evidence against the venture. It is a Venture OS state-integrity defect that must be corrected before the gate.

## Required outcome

Exactly one of:
- `PROCEED`
- `TEST`
- `PARK`

## Canonical state first

After the gatekeeper returns:

1. update `venture.yaml` first;
2. set `latest_decision.id`, `latest_decision.outcome`, and `latest_decision.path` using a new stable decision ID;
3. write one structured current `next_action` with a stable `N###` ID, exactly one primary assumption where applicable, an instruction, and success/failure signals. Keep `depends_on: []`;
4. write `blocking_assumptions` only for assumptions that still prevent the current venture from advancing. For `TEST`, the assumption targeted by `next_action.assumption_id` must be included;
5. for every additional blocking assumption not targeted by the current `next_action`, add a `blocking_deferrals` entry with that assumption ID and an explicit reason describing when or why it will be resolved later;
6. write `do_not_build` as ID-bearing `DNB###` objects, never bare strings or ordinal references;
7. for `PARK`, write `revisit_when` as ID-bearing `T###` objects and express any combination rule only with those IDs;
8. populate `latest_decision.snapshot` as an exact deep copy of the decision-time values of `next_action`, `blocking_assumptions`, `blocking_deferrals`, `do_not_build`, `revisit_when`, and `reopen_combination_rule`;
9. once written, treat `latest_decision.snapshot` as immutable until a new decision replaces `latest_decision` with a new ID and new snapshot;
10. create the immutable decision file from `templates/decision.md` and copy `decision_id`, `outcome`, and the full `latest_decision.snapshot` exactly into its projection block;
11. run `npm run evidence:check -- $ARGUMENTS` again after the decision file exists. The decision is not complete until this passes.

Do not delete or rewrite earlier decision records. Later workflow stages may replace current operational fields such as `next_action`; they must not mutate the decision snapshot that justified the transition.

For `TEST`, the next action should normally be one experiment or one prerequisite to that experiment, not two bundled arms. Secondary blockers may remain only when `blocking_deferrals` explains their later resolution.
For `PROCEED`, advance only one stage.
For `PARK`, add concrete revisit conditions with stable trigger IDs.
