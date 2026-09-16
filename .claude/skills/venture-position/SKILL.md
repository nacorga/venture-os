---
name: venture-position
description: Creates evidence-constrained positioning and an initial market offer for a Venture OS venture that has passed the relevant gate. Use before designing a landing, outreach, pre-sale, or other market-facing experiment.
argument-hint: <venture-dir>
---

# Venture Position

Target venture directory: `$ARGUMENTS`

Read the current decision, evidence, ICP hypothesis, alternatives, and open risks from the target venture.

Invoke `positioning-strategist`.

Persist `positioning.md` with:
- primary ICP;
- problem/job;
- current alternative;
- promise/outcome;
- differentiator;
- reason to believe;
- offer;
- pricing hypothesis, if justified;
- objections;
- message hypotheses;
- claims we are not allowed to make yet.

Do not disguise uncertain positioning as validated truth.

Update stage to `positioning`. Replace `next_action` with the next stable `N###` object whose single instruction is to design the market experiment. Set `type: experiment`; point `assumption_id` at the assumption the experiment is intended to resolve when known, otherwise null. Do not revert to a free-text action.
