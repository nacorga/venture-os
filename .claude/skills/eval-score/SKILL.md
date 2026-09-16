---
name: eval-score
description: Score one frozen Venture OS eval run against the evaluator-only reference and behavior rubric. Use manually in a fresh session after /eval-freeze.
argument-hint: <run-id>
disable-model-invocation: true
---

# Eval Score

Run ID: `$ARGUMENTS`

If no run ID was provided, stop and show:

```text
/eval-score <run-id>
```

Set `<run-dir>` to `evals/runs/$ARGUMENTS`.

Scoring evaluates Venture OS behavior, not whether the venture itself is attractive.

## Session isolation

Run this skill in a fresh Claude Code session that did not author the run artifacts.

If `<run-dir>/SCORE.md` already exists, it is a prior score, not input to the new score. **Do not open or read it until the independent scoring pass is complete and a full replacement score has been drafted from frozen artifacts plus the evaluator reference.** Only then may you compare the prior score for disagreement analysis. This prevents anchoring on a superseded/self-score.

If you know the current session authored the run, stop and tell the user to open a fresh session. If session provenance is uncertain, disclose that limitation in evaluator confidence rather than silently assuming independence.

## Preconditions

1. `<run-dir>` must contain `FROZEN.json`.
2. Run `npm run eval:verify -- $ARGUMENTS` and require a successful integrity check before scoring.
3. Do not change `venture/`, `RESULT.md`, `case.yaml`, or any frozen run artifact.
4. Read the case name from `<run-dir>/metadata.json`.
5. Only after integrity verification may you read `evals/reference/<case>.yaml`.
6. Read `evals/README.md` for the common scoring rubric.
7. If a prior `SCORE.md` exists, keep it closed until the independent score is fully determined.

If the run is not frozen, stop and tell the user to run:

```text
/eval-freeze $ARGUMENTS
```

If integrity verification fails, stop and mark the run invalid rather than scoring altered artifacts.

## Scoring

Score each common behavior from 0–2:

1. critical uncertainties identified;
2. major alternatives discovered;
3. facts separated from assumptions;
4. disconfirming evidence sought;
5. weak market-size proxies avoided;
6. premature product scope avoided;
7. cheap experiment proposed when appropriate;
8. uncertainty preserved rather than fabricated;
9. gate decision auditable;
10. contradictory evidence changes the analysis appropriately.

Then assess reference coverage separately:

- which expected uncertainties were discovered independently;
- which were missed or materially weakened;
- whether any listed anti-pattern occurred;
- important useful findings not anticipated by the reference.

Do not force semantic exact-match. A differently worded or stronger discovery counts when it addresses the same underlying risk.

## Output

Write `<run-dir>/SCORE.md` with:

- behavior score out of 20;
- per-item rationale with evidence from frozen artifacts;
- reference coverage;
- regressions or failure modes;
- novel useful discoveries;
- 1–3 concrete changes to agents/skills, only when supported by the observed failure;
- evaluator confidence and any contamination concerns.

If this replaces a prior score, say so explicitly in the new file and record material disagreements after the independent score is already fixed. Never inherit prior rationales merely because the total matches.

Never turn the score into a rating of the business idea.

Re-run `npm run eval:verify -- $ARGUMENTS` after writing `SCORE.md` and report whether the frozen digest remains unchanged.
