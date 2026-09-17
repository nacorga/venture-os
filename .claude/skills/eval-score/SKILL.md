---
name: eval-score
description: Score one frozen Venture OS eval run against its frozen evaluator reference and behavior rubric. Use manually in a fresh session after /eval-freeze.
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

If `<run-dir>/SCORE.md` already exists, it is a prior score, not input to the new score. **Do not open or read it until the independent scoring pass is complete and a full replacement score has been drafted from frozen artifacts plus the frozen evaluator bundle.** Only then may you compare the prior score for disagreement analysis.

If you know the current session authored the run, stop and tell the user to open a fresh session. If session provenance is uncertain, disclose that limitation in evaluator confidence rather than silently assuming independence.

## Preconditions

1. `<run-dir>` must contain `FROZEN.json`.
2. Run `npm run eval:verify -- $ARGUMENTS` and require a successful integrity check before scoring.
3. Do not change `venture/`, `RESULT.md`, `case.yaml`, `evaluator/`, or any frozen run artifact.
4. Read the case name, model label and recorded provenance from `<run-dir>/metadata.json`.
5. Require `<run-dir>/evaluator/rubric.md` and `<run-dir>/evaluator/score-skill.md`.
6. For a scored regression case, require `<run-dir>/evaluator/reference.yaml`.
7. **Never read the live `evals/reference/`, live `evals/README.md`, or current evaluator reference as scoring input.** The frozen copies are authoritative for this run.
8. Read `<run-dir>/evaluator/PROVENANCE.json` and report its framework/evaluator hashes in evaluator provenance.
9. If a prior `SCORE.md` exists, keep it closed until the independent score is fully determined.

If the run is not frozen, stop and tell the user to run:

```text
/eval-freeze $ARGUMENTS
```

If integrity verification fails, stop and mark the run invalid rather than scoring altered artifacts.

## Frozen scoring contract

After the preconditions pass, read `<run-dir>/evaluator/score-skill.md`. Use its **Scoring** and **Output** sections as the scoring contract that was current when this run was frozen. If the frozen copy predates this bootstrap convention, use `<run-dir>/evaluator/rubric.md` for the behavior rubric and record that limitation in evaluator confidence.

Read `<run-dir>/evaluator/reference.yaml` only after the run integrity check succeeds.

## Scoring

Score each common behavior from the frozen rubric from 0–2. The current canonical behaviors are:

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

Then assess frozen reference coverage separately:

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
- evaluator provenance: evaluator/model identifier when known, frozen framework sha256, frozen reference/rubric hashes, and session-independence status;
- evaluator confidence and any contamination concerns.

If this replaces a prior score, say so explicitly in the new file and record material disagreements after the independent score is already fixed. Never inherit prior rationales merely because the total matches.

Never turn the score into a rating of the business idea.

Re-run `npm run eval:verify -- $ARGUMENTS` after writing `SCORE.md` and report whether the frozen digest remains unchanged.
