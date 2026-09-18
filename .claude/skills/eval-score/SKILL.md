---
name: eval-score
description: Score one frozen Venture OS eval run against its frozen evaluator reference and behavior rubric, as one named judge. Use manually in a fresh session after /eval-freeze.
argument-hint: <run-id> <judge-label>
disable-model-invocation: true
---

# Eval Score

Arguments: `$ARGUMENTS`

Run ID: `$0`

Judge label: `$1`

If either is missing, stop and show:

```text
/eval-score <run-id> <judge-label>
```

The judge label names this scoring pass — for example the model and a letter, `opus-a`. It may contain only letters, numbers, dots, underscores and hyphens. Each independent judge uses its own label in its own fresh session; a label is never reused on the same run.

Set `<run-dir>` to `evals/runs/$0` and `<score-file>` to `<run-dir>/scores/$1.md`. If `<score-file>` already exists, stop: that label has already scored this run.

Scoring evaluates Venture OS behavior, not whether the venture itself is attractive.

## Session isolation

Run this skill in a fresh Claude Code session that did not author the run artifacts.

Every other `.md` file in `<run-dir>/scores/`, and a legacy `<run-dir>/SCORE.md`, is another judge's score, not input to this one. **Do not open or list their contents until this score has been fully drafted from frozen artifacts plus the frozen evaluator bundle.** Only then may you compare them for disagreement analysis.

If you know the current session authored the run, stop and tell the user to open a fresh session. If session provenance is uncertain, disclose that limitation in evaluator confidence rather than silently assuming independence.

## Preconditions

1. `<run-dir>` must contain `FROZEN.json`.
2. Run `npm run eval:verify -- $0` and require a successful integrity check before scoring.
3. Do not change `venture/`, `RESULT.md`, `case.yaml`, `evaluator/`, or any frozen run artifact.
4. Read the case name, model label and recorded provenance from `<run-dir>/metadata.json`.
5. Require `<run-dir>/evaluator/rubric.md` and `<run-dir>/evaluator/score-skill.md`.
6. For a scored regression case, require `<run-dir>/evaluator/reference.yaml`.
7. **Never read the live `evals/reference/`, a suite's references, the live `evals/RUBRIC.md`, or any current evaluator reference as scoring input.** The frozen copies are authoritative for this run.
8. Read `<run-dir>/evaluator/PROVENANCE.json` and report its framework/evaluator hashes in evaluator provenance.
9. Keep other judges' scores closed until this score is fully determined.

If the run is not frozen, stop and tell the user to run:

```text
/eval-freeze $0
```

If integrity verification fails, stop and mark the run invalid rather than scoring altered artifacts.

## Frozen scoring contract

After the preconditions pass, read `<run-dir>/evaluator/score-skill.md`. Use its **Scoring** and **Output** sections as the scoring contract that was current when this run was frozen. If the frozen copy predates this bootstrap convention, use `<run-dir>/evaluator/rubric.md` for the behavior rubric and record that limitation in evaluator confidence.

Read `<run-dir>/evaluator/reference.yaml` only after the run integrity check succeeds.

## Scoring

Score against the frozen rubric, `<run-dir>/evaluator/rubric.md`. It says which behaviors are judged, which are checked by script instead, and the output block every score carries. Do not score from memory of an earlier rubric: a run frozen under rubric 1 is scored under rubric 1.

Before scoring, build the run's fact sheet without looking at any verdict:

```bash
npm run eval:verdict -- $0 --facts-only
```

It writes `<run-dir>/scores/facts.json` and prints nothing about verdicts. Read that file and cite its counts rather than recounting. **Never open `scores/mechanical.json` or `scores/pairs.json`** before this score is fixed: knowing whether a run passed its mechanical checks biases how its prose reads.

Then assess frozen reference coverage separately:

- which expected uncertainties were discovered independently;
- which were missed or materially weakened;
- whether any listed anti-pattern occurred;
- important useful findings not anticipated by the reference.

Do not force semantic exact-match. A differently worded or stronger discovery counts when it addresses the same underlying risk.

## Output

Write `<score-file>` with:

- the output block the frozen rubric defines, when it defines one — otherwise the behavior score in the form that rubric uses;
- per-item rationale with evidence from frozen artifacts, and for every 2, what you checked and did not find;
- reference coverage;
- regressions or failure modes;
- novel useful discoveries;
- 1–3 concrete changes to agents/skills, only when supported by the observed failure;
- evaluator provenance: evaluator/model identifier when known, frozen framework sha256, frozen reference/rubric hashes, and session-independence status;
- evaluator confidence and any contamination concerns.

Record material disagreements with other judges only after this score is fixed. Never inherit another judge's rationale merely because the total matches.

Never turn the score into a rating of the business idea.

Re-run `npm run eval:verify -- $0` after writing `<score-file>` and report whether the frozen digest remains unchanged.
