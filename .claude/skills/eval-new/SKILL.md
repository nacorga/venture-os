---
name: eval-new
description: Create a new isolated Venture OS eval run from a Case Library entry and model label. Use manually to start a benchmark without copying setup instructions.
argument-hint: <case> <model-label>
disable-model-invocation: true
---

# Eval New

Arguments: `$ARGUMENTS`

If the case is missing, stop and show:

```text
/eval-new <case> <model-label>
```

## Procedure

1. Run the deterministic primitive with the supplied arguments:

   ```bash
   npm run eval:new -- $ARGUMENTS
   ```

2. Capture the generated run ID from the command output or the newly created directory under `evals/runs/`.
3. Do not inspect `evals/reference/`, other runs, other Case Library entries, or git history for expected answers.
4. Do **not** start the benchmark in this session. A fresh session is part of the contamination boundary.

## Completion

Tell the user to open a fresh Claude Code session and run exactly:

```text
/eval-run <generated-run-id>
```

Do not reproduce the run procedure. `eval-run` owns it.
