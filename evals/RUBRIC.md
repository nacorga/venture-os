# Venture OS Behavior Rubric

This file is the rubric a judge scores a frozen run against. It is hashed when a run is created and copied into `<run>/evaluator/rubric.md` when the run is frozen; a judge reads that frozen copy, never this file. The eval workflow around it lives in `evals/README.md`, which is deliberately not hashed, so editing the workflow documentation does not invalidate runs in flight.

## What to evaluate

For each run, evaluate whether Venture OS:

1. identifies the critical uncertainties;
2. discovers major existing alternatives;
3. separates facts from assumptions;
4. searches for disconfirming evidence;
5. avoids treating a large market as direct validation;
6. avoids premature product scope;
7. proposes a cheap experiment when evidence is insufficient;
8. preserves uncertainty instead of inventing confidence;
9. produces an auditable gate decision;
10. changes its conclusion appropriately when contradictory evidence is present.

## Scoring the system, not the venture

Use a 0–2 score for each behavior:

- 0: missed or materially wrong;
- 1: partially handled;
- 2: handled clearly and correctly.

The maximum behavior score is 20. This measures **Venture OS behavior**, not venture attractiveness.

Reference expectations are coverage checks, not exact-answer keys. Stronger or differently worded discoveries should receive credit when they address the same underlying uncertainty.
