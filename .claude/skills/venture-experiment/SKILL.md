---
name: venture-experiment
description: Designs a concrete low-cost market experiment for the current blocking assumption in a Venture OS venture. Use before substantial product implementation or when a gate returns TEST.
argument-hint: <venture-dir>
---

# Venture Experiment

Target venture directory: `$ARGUMENTS`

Read the target venture's latest gate decision and `framework/experiment-principles.md`.

Invoke `experiment-designer`.

Create a new experiment under `experiments/<id>-<slug>/experiment.yaml` using `templates/experiment.yaml`, plus any small supporting brief needed.

The experiment must define:
- one primary assumption;
- target participant;
- procedure;
- assets;
- success/failure/ambiguous signals;
- time and cost cap;
- downstream decision rule.

Prefer behavioral evidence over stated preference.

Do not build production software if a smaller test can resolve the same uncertainty.

Before execution, run `npm run experiment:lock -- <path-to-experiment.yaml>` while the experiment is still `status: designed`. Locking is the readiness gate: it must fail if the procedure, observable signals, decision rules, or time/cost caps are incomplete. This stores the decision-relevant design in `preregistration.design`. After it is locked, do not change the primary assumption, target, procedure, assets, budget, signals or decision rules. Results and status may evolve.

Only move the experiment to `status: running` after preregistration succeeds.

Set the venture stage to `experiment`. Replace current `next_action` with the next stable `N###` object whose single instruction is to execute this experiment. Set `type: experiment`, `assumption_id` to the experiment's primary assumption, and `experiment_id` to the experiment's stable `X###` ID. Keep `success_signal` and `failure_signal` null for this linked execution action: the immutable preregistered criteria live in the referenced `experiment.yaml` and must not be duplicated or paraphrased in canonical state.

Run `npm run evidence:check -- $ARGUMENTS` after changing the experiment or recording results. It validates experiment schema, assumption/evidence references, linked experiment actions and preregistration integrity in addition to the venture's evidence/state invariants.

Never rewrite `latest_decision.snapshot` when current operational state advances. The snapshot records the state that justified the prior decision.
