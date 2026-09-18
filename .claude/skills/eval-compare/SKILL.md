---
name: eval-compare
description: Judge one blind pairwise comparison of two frozen Venture OS eval runs of the same case. Use manually in a fresh session after npm run eval:compare builds the comparison.
argument-hint: <compare-id> <judge-label>
disable-model-invocation: true
---

# Eval Compare

Arguments: `$ARGUMENTS`

Comparison ID: `$0`

Judge label: `$1`

If either is missing, stop and show:

```text
/eval-compare <compare-id> <judge-label>
```

Set `<compare-dir>` to `evals/compare/$0` and `<judgment-file>` to `<compare-dir>/judgments/$1.md`. If `<judgment-file>` already exists, stop: that label has already judged this comparison.

## Blindness

`<compare-dir>` holds two frozen runs of one case under neutral names, `X/` and `Y/`, the case both started from, and the comparison rubric, `compare.md`. Which run is which is sealed.

- Read only `<compare-dir>/compare.md`, `<compare-dir>/case.yaml`, `<compare-dir>/X/` and `<compare-dir>/Y/`.
- **Never open** `evals/compare/.keys/`, anything under `evals/runs/`, `<compare-dir>/manifest.json`, `<compare-dir>/result.json`, or another judge's file in `<compare-dir>/judgments/`.
- Never run `npm run eval:compare`. Unblinding happens outside judge sessions.
- Do not guess which model, framework version or order produced a run, and do not let a guess weigh on a preference.

Run this skill in a fresh Claude Code session that did not author either run and has not judged this comparison under another label.

## Judging

Follow `compare.md`: for each behavior, prefer X, Y or neither, and quote the passage from each run that decides it. A preference is not a score — two strong runs still have a better one when a difference can be quoted, and `tie` means no quotable difference matters.

Write `<judgment-file>` with the rationale per behavior, the overall preference, and the block `compare.md` defines, verbatim in shape.

## Completion

Tell the user the judgment is written and that unblinding runs outside judge sessions:

```text
npm run eval:compare -- --unblind $0
```
