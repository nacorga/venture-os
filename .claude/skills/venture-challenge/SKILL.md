---
name: venture-challenge
description: Stress-tests an existing Venture OS venture after research. Use to seek the strongest evidence-based case against the thesis and identify what should not be built yet.
argument-hint: <venture-dir>
---

# Venture Challenge

Target venture directory: `$ARGUMENTS`

Read the complete target venture state and current research. Read `framework/anti-bias.md`.

Invoke the `challenger` subagent with the venture's current thesis and evidence set.

Persist the synthesis to `research/YYYY-MM-DD-challenge.md`.

Update `venture.yaml` only for newly explicit assumptions, risks, blocked unknowns, and canonical guardrails. Do not silently change earlier evidence.

The output must include:
- strongest failure modes;
- unsupported leaps;
- contradictory evidence;
- critical unknowns;
- explicit do-not-build items;
- evidence that would change the challenge assessment.

Any do-not-build item persisted to state must be an object with a stable `DNB###` ID, statement, and reason/evidence where available. Never use positional references.

Replace `next_action` with the next stable `N###` object whose single instruction is to run the decision gate. Set `type: decision`; point `assumption_id` at the principal blocker when one clearly dominates, otherwise null.
