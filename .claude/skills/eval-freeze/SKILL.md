---
name: eval-freeze
description: Validate, freeze, and verify one completed Venture OS eval run. Use manually after /eval-run and before /eval-score.
argument-hint: <run-id> [--suite <path>]
disable-model-invocation: true
---

# Eval Freeze

Run ID: `$0`

Arguments: `$ARGUMENTS`

If no run ID was provided, stop and show:

```text
/eval-freeze <run-id> [--suite <path>]
```

A run created with `--suite` must be frozen with the same `--suite <path>`: the evaluator reference is copied from there. Freeze refuses the mismatch either way.

Set `<run-dir>` to `evals/runs/$0`.

## Procedure

1. Confirm `<run-dir>/RESULT.md` and `<run-dir>/venture/venture.yaml` exist.
2. Do not read `evals/reference/`, the live rubric, or any evaluator-only content.
3. Run:

   ```bash
   npm run evidence:check -- evals/runs/$0/venture
   ```

   Stop if it fails. Repair state integrity before freezing.

4. Run:

   ```bash
   npm run eval:freeze -- $ARGUMENTS
   ```

   The deterministic freeze primitive independently revalidates the case, canonical venture state, complete decision, evidence/experiment integrity, effective framework hash and evaluator-source hashes. Only after those checks pass does it create `<run-dir>/evaluator/` with the frozen reference/rubric/scoring contract.

5. Run:

   ```bash
   npm run eval:verify -- $0
   ```

6. Require successful integrity and evaluator-provenance verification. Report the frozen artifact SHA-256 and framework SHA-256.
7. Do not modify any frozen artifact or evaluator input after this point. `scores/` — and a legacy root `SCORE.md` — is intentionally the only scoring output outside the frozen digest.

## Completion

Tell the user to open a **fresh Claude Code session** and run exactly:

```text
/eval-score $0 <judge-label>
```

For a second independent judge, repeat that in another fresh session with a different label.

Do not reproduce the scoring procedure. `eval-score` owns it.
