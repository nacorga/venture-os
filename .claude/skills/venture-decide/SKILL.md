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
2. set `latest_decision` with the new stable decision ID and final path;
3. write one structured `next_action` with a stable `N###` ID, exactly one primary assumption where applicable, an instruction, and success/failure signals. Keep `depends_on: []`; version 2 does not preserve historical actions, so dangling action dependencies are invalid;
4. write `blocking_assumptions` only for assumptions that still prevent the current venture from advancing. For `TEST`, the assumption targeted by `next_action.assumption_id` must be included;
5. for every additional blocking assumption not targeted by the current `next_action`, add a `blocking_deferrals` entry with that assumption ID and an explicit reason describing when or why it will be resolved later. Do not call an assumption blocking while giving it no resolution path;
6. write `do_not_build` as ID-bearing `DNB###` objects, never bare strings or ordinal references;
7. for PARK, write `revisit_when` as ID-bearing `T###` objects and express any combination rule only with those IDs;
8. create the immutable decision file from `templates/decision.md` as a projection of this canonical state;
9. copy the projection block values exactly from `venture.yaml`; do not paraphrase them;
10. run `npm run evidence:check -- $ARGUMENTS` again after the decision file exists. The decision is not complete until this passes.

Do not delete or rewrite earlier decision records.

For `TEST`, the next action should normally be one experiment or one prerequisite to that experiment, not two bundled arms. Secondary blockers may remain only when `blocking_deferrals` explains their later resolution.
For `PROCEED`, advance only one stage.
For `PARK`, add concrete revisit conditions with stable trigger IDs.
