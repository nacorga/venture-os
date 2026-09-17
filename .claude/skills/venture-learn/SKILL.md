---
name: venture-learn
description: Converts real experiment results, leads, customer behavior, objections, and outcomes into updated Venture OS evidence and a new decision recommendation. Use after an experiment has produced observations.
argument-hint: <venture-dir>
---

# Venture Learn

Target venture directory: `$ARGUMENTS`

Read the target venture's completed experiment definition and raw results. Require at least one recorded observation and a completion timestamp before treating the experiment as completed; a cancelled experiment may inform a later decision only through an explicit learning note about the cancellation, not fabricated result evidence.

Persist a learning note under `learning/` that separates:
- observations;
- interpretation;
- unexpected behavior;
- evidence created;
- assumptions strengthened or weakened;
- experiment limitations.

Create stable first-party evidence IDs for material observations.

Update the venture state without deleting contrary evidence.

Replace current `next_action` with the next stable `N###` object whose single instruction is to run `venture-decide` again. Set `type: decision`; point `assumption_id` at the assumption most changed by the experiment when one clearly dominates, otherwise null.

Never rewrite `latest_decision.snapshot` while recording learning. The snapshot remains the immutable state that justified the prior decision until a new decision replaces it.

Do not automatically declare success because the experiment generated activity.
