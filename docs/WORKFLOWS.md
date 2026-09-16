# Venture OS Workflows

This document is the human-facing command map. It intentionally does **not** duplicate the procedures inside skills.

## Rule

Use slash commands for repeatable Claude Code workflows.

- Procedure: skill
- Global invariant: `CLAUDE.md` / `framework/`
- Venture state: `venture.yaml` and artifacts
- Dynamic value: skill argument
- Deterministic primitive: script / `npm run`

If you would paste the same operational prompt twice, create or update a skill.

## Normal venture

Create the filesystem scaffold outside Claude Code when convenient:

```bash
npm run venture:new -- my-venture "One sentence idea"
claude
```

Then, inside Claude Code:

```text
/venture-new ventures/my-venture
/venture-research ventures/my-venture
/venture-challenge ventures/my-venture
/venture-decide ventures/my-venture
```

The first four commands form the common path to an auditable gate. After that, follow the gate rather than a fixed sequence.

### `PROCEED`

Current evidence justifies investing in the next stage:

```text
/venture-position ventures/my-venture
/venture-experiment ventures/my-venture
```

### `TEST`

A critical assumption blocks progression. Design the cheapest credible experiment that targets the active blocker:

```text
/venture-experiment ventures/my-venture
```

### `PARK`

Stop. Do not continue the workflow until a recorded revisit condition or genuinely new evidence justifies reopening the venture.

### After an experiment

Once real evidence exists:

```text
/venture-learn ventures/my-venture
/venture-decide ventures/my-venture
```

At any point:

```text
/venture-status ventures/my-venture
```

The venture directory is the argument. Do not append a second paragraph explaining the normal procedure; the skill already owns it.

## Public benchmark

Benchmark inputs come from canonical Case Library entries under `cases/<case-id>/case.yaml`. Evaluator expectations remain separate under `evals/reference/`.

### Session A — create

```text
/eval-new inventory-monitoring-saas claude-opus-5
```

Copy only the generated run ID.

### Session B — isolated run

Open a fresh Claude Code session:

```text
/eval-run <run-id>
```

When it finishes:

```text
/eval-freeze <run-id>
```

### Session C — score

Open another fresh Claude Code session:

```text
/eval-score <run-id>
```

Fresh-session boundaries are part of the evaluation design, not optional ceremony.

Real or sensitive holdout benchmarks stay outside the public repository and should run against a pinned public commit.

## Low-level scripts

Scripts exist for deterministic mechanics and automation. Use them when debugging or integrating Venture OS programmatically, not because the user must memorize another workflow.

```bash
npm run venture:new -- <slug> "<idea>"
npm run venture:check -- <slug>
npm run evidence:check -- <venture-dir>
npm run case:new -- <id> "<title>" "<statement>" <category>
npm run case:validate -- [<case-id|path>]
npm run eval:new -- <case> <model-label>
npm run eval:freeze -- <run-id>
npm run eval:verify -- <run-id>
npm run repo:check
```

## Where to change behavior

When a workflow needs improvement:

1. Change the owning `SKILL.md` if the procedure changes.
2. Change `CLAUDE.md` or `framework/` if a global invariant changes.
3. Change a script if deterministic mechanics change.
4. Update docs only when command names, ordering, gate semantics, or user-facing expectations change.
5. Do not patch multiple copies of the same prompt because there should not be multiple copies.
