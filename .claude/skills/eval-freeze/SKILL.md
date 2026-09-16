---
name: eval-freeze
description: Validate, freeze, and verify one completed Venture OS eval run. Use manually after /eval-run and before /eval-score.
argument-hint: <run-id>
disable-model-invocation: true
---

# Eval Freeze

Run ID: `$ARGUMENTS`

If no run ID was provided, stop and show:

```text
/eval-freeze <run-id>
```

Set `<run-dir>` to `evals/runs/$ARGUMENTS`.

## Procedure

1. Confirm `<run-dir>/RESULT.md` and `<run-dir>/venture/venture.yaml` exist.
2. Do not read `evals/reference/`.
3. Run:

   ```bash
   npm run evidence:check -- evals/runs/$ARGUMENTS/venture
   ```

   Stop if it fails. Repair state integrity before freezing.

4. Run:

   ```bash
   npm run eval:freeze -- $ARGUMENTS
   ```

5. Run:

   ```bash
   npm run eval:verify -- $ARGUMENTS
   ```

6. Require successful integrity verification. Report the frozen SHA-256 digest.
7. Do not modify any frozen artifact after this point.

## Completion

Tell the user to open a **fresh Claude Code session** and run exactly:

```text
/eval-score $ARGUMENTS
```

Do not reproduce the scoring procedure. `eval-score` owns it.
