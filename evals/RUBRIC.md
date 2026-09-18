# Venture OS Behavior Rubric

This file is the rubric a judge scores a frozen run against. It is hashed when a run is created and copied into `<run>/evaluator/rubric.md` when the run is frozen; a judge reads that frozen copy, never this file. The eval workflow around it lives in `evals/README.md`, which is deliberately not hashed, so editing the workflow documentation does not invalidate runs in flight.

## What the total is for

The judged total is a **floor alarm**, not a comparison instrument. A strong run scores near the maximum, and the difference between two strong runs is smaller than the difference between two judges reading the same run. Use the total to catch a run that falls through the floor. To compare two versions of Venture OS, use what discriminates: mechanical verdicts on forked runs, blind pairwise comparison, and the spread between independent judges (`evals/README.md`).

## What is checked by script, not judged

These behaviors have a mechanical check, and a judge does not score them:

- **The gate decision is auditable.** Freeze refuses a run whose decision record, `RESULT.md` and canonical snapshot disagree, whose IDs dangle, or whose decision to experiment has no locked experiment with routed outcomes.
- **Contradictory evidence changes the analysis.** A frozen run is forked and shown evidence it never saw; `npm run eval:verdict` checks the second decision against the run's own preregistration or a planted reveal pair.
- **Counts the judge would otherwise re-derive.** `scores/facts.json` carries the evidence index broken down by type, direction and strength, the first-party count, assumptions by status, guardrail counts, market-size vocabulary with its file and line, and whether a decided experiment is locked. Cite it; do not recount by hand.

## What is judged

Score each item 0, 1 or 2:

- **2** — handled clearly and correctly, and you looked for a defect under this item and found none;
- **1** — handled, with at least one defect you can quote;
- **0** — missed, or materially wrong.

A defect under an item caps that item at 1, however good the rest is. A 2 is a claim that you searched and found nothing, so each 2 names what you checked.

1. `critical_uncertainties` — the assumptions whose failure would end or redirect the venture are identified, ranked, and each carries a condition that would show it false. Missing a kill-level uncertainty is a 0.
2. `alternatives` — existing alternatives are found, including the manual, do-nothing and free native options, and the analysis says which of them is the real competitor. Naming only paid lookalikes is a 1.
3. `facts_vs_assumptions` — every material statement is a fact with its source, a labeled inference, or an assumption; derived figures disclose how they were derived; evidence does not travel between segments without a stated reason. One inference presented as fact is a 1.
4. `disconfirming_evidence` — evidence against the thesis was searched for deliberately, and what was found changed a status, a ranking or the decision. Disconfirming evidence that was found and then ignored is a 1.
5. `market_size_proxies` — market size, market growth or search volume are never treated as demand for this product. `facts.json` lists every occurrence of that vocabulary; judge each in context.
6. `scope_restraint` — nothing is proposed for building before the blocking uncertainty is resolved, and `do_not_build` names the tempting things specifically enough to refuse them later.
7. `experiment_quality` — when the gate is TEST, the locked experiment is the cheapest credible test of the blocking assumption: it measures behavior rather than stated preference where behavior is available, its success and failure signals cannot both be met by one plausible result, and its time and cost caps are proportionate. When the gate is not TEST, score whether the absence of an experiment is justified.
8. `uncertainty_preserved` — what is unknown stays unknown: statuses are not upgraded without evidence, evidence gaps are recorded as gaps, and strength reflects the evidence class rather than how convincing the prose is.

Reference expectations are coverage checks, not exact-answer keys. Stronger or differently worded discoveries receive credit when they address the same underlying uncertainty.

## Output block

Every score file carries this block, verbatim in shape, so scores can be aggregated without reading prose:

```text
<!-- venture-os-score:start -->
rubric: 2
judge: <judge-label>
scores:
  critical_uncertainties: <0|1|2>
  alternatives: <0|1|2>
  facts_vs_assumptions: <0|1|2>
  disconfirming_evidence: <0|1|2>
  market_size_proxies: <0|1|2>
  scope_restraint: <0|1|2>
  experiment_quality: <0|1|2>
  uncertainty_preserved: <0|1|2>
total: <0-16>
<!-- venture-os-score:end -->
```

This measures **Venture OS behavior**, not venture attractiveness.
