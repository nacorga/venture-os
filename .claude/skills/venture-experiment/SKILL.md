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

Keep the experiment in `status: designed` while editing its design. Immediately before execution, run:

```text
npm run experiment:lock -- <path-to-experiment.yaml>
```

The lock command moves the experiment to `running` and records a SHA-256 over the decision-relevant design. After that point, changing the target, procedure, budget, signals, or decision rules is an integrity failure. Record deviations as observations/limitations instead of rewriting the preregistered design.

Set the venture stage to `experiment`. Replace current `next_action` with the next stable `N###` object whose single instruction is to execute this experiment. Set `type: experiment`, `assumption_id` to the experiment's primary assumption, and copy the experiment's pre-registered success/failure signals into canonical state rather than paraphrasing them.

Never rewrite `latest_decision.snapshot` when current operational state advances. The snapshot records the state that justified the prior decision.
