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
2. Do not read `evals/reference/`, the live rubric, or any evaluator-only content.
3. Run:

   ```bash
   npm run evidence:check -- evals/runs/$ARGUMENTS/venture
   ```

   Stop if it fails. Repair state integrity before freezing.

4. Run:

   ```bash
   npm run eval:freeze -- $ARGUMENTS
   ```

   The deterministic freeze primitive independently revalidates the case, canonical venture state, complete decision, evidence/experiment integrity, effective framework hash and evaluator-source hashes. Only after those checks pass does it create `<run-dir>/evaluator/` with the frozen reference/rubric/scoring contract.

5. Run:

   ```bash
   npm run eval:verify -- $ARGUMENTS
   ```

6. Require successful integrity and evaluator-provenance verification. Report the frozen artifact SHA-256 and framework SHA-256.
7. Do not modify any frozen artifact or evaluator input after this point. `SCORE.md` is intentionally the only scoring output outside the frozen digest.

## Completion

Tell the user to open a **fresh Claude Code session** and run exactly:

```text
/eval-score $ARGUMENTS
```

Do not reproduce the scoring procedure. `eval-score` owns it.
