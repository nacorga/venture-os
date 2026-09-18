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

Generated workspaces under `ventures/` are private-by-default and gitignored.

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

### Before executing an experiment

`/venture-experiment` owns the procedure and uses the deterministic lock primitive before execution:

```bash
npm run experiment:lock -- ventures/my-venture/experiments/<experiment>/experiment.yaml
```

Once locked, the experiment's primary assumption, target, procedure, assets, budget, signals and decision rules are preregistered. Results and status may evolve; the preregistered design may not.

An execution action may point only to a preregistered experiment that is ready or running. If a draft is abandoned before execution, preserve it as `cancelled` with a timestamp and reason; it does not need a fabricated preregistration. A completed experiment must retain at least one observation and its completion timestamp.

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

Benchmark inputs come from canonical Case Library entries under `cases/<case-id>/case.yaml`. Evaluator expectations remain separate under `evals/reference/` during execution.

### Session A — create

```text
/eval-new inventory-monitoring-saas claude-opus-5
```

Creation records the effective framework hash, case hash, git state, model label and evaluator-source hashes without exposing evaluator content to the run. Copy only the generated run ID. A private holdout adds `--suite <path>` here and at freeze; see `evals/README.md` § Private benchmark boundary.

### Session B — isolated run

Open a fresh Claude Code session:

```text
/eval-run <run-id>
```

When it finishes:

```text
/eval-freeze <run-id>
```

Freeze requires a schema-valid venture, a complete gate decision, a passing integrity check, and the same effective runtime/evaluator basis recorded at creation. When the decision chose an experiment, that experiment must be designed and locked with routed success and failure outcomes. Only after those checks pass is the evaluator bundle copied under the frozen run.

### Session C — score, once per judge

Open another fresh Claude Code session for each judge:

```text
/eval-score <run-id> <judge-label>
```

Each judge writes `scores/<judge-label>.md`. Scoring uses the frozen `evaluator/` bundle, never the repository's live reference/rubric as a silent substitute.

### Session D — a second phase, per fork

A frozen run can be forked and shown evidence it never saw (`evals/README.md` § Staged evidence reveal):

```bash
npm run eval:fork -- <run-id> --arm prereg-failure
```

Open a fresh Claude Code session for each fork:

```text
/eval-continue <fork-id>
/eval-freeze <fork-id>
```

Then judge it without a model: `npm run eval:verdict -- <fork-id>`.

Fresh-session boundaries are part of the evaluation design, not optional ceremony.

Real or sensitive holdout benchmarks stay outside the public repository and should run against a pinned public commit or recorded effective runtime hash.

## Low-level scripts

Scripts exist for deterministic mechanics and automation. Use them when debugging or integrating Venture OS programmatically, not because the user must memorize another workflow.

```bash
npm run venture:new -- <slug> "<idea>"
npm run venture:check -- <slug>
npm run evidence:check -- <venture-dir>
npm run experiment:lock -- <experiment-dir|experiment.yaml>
npm run case:new -- <id> "<title>" "<statement>" <category>
npm run case:validate -- [<case-id|path>]
npm run eval:new -- <case> <model-label> [--suite <path>]
npm run eval:freeze -- <run-id> [--suite <path>]
npm run eval:verify -- <run-id>
npm run eval:fork -- <run-id> --arm <arm> [--rep <n>] [--suite <path>] [--model-label <label>] [--cross-framework]
npm run eval:verdict -- <run-id>
npm run repo:check
```

## Where to change behavior

When a workflow needs improvement:

1. Change the owning `SKILL.md` if the procedure changes.
2. Change `CLAUDE.md` or `framework/` if a global invariant changes.
3. Change a script if deterministic mechanics change.
4. Update docs only when command names, ordering, gate semantics, or user-facing expectations change.
5. Do not patch multiple copies of the same prompt because there should not be multiple copies.
