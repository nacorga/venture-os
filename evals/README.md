# Venture OS Evals

The purpose of evals is not to prove that an LLM can reproduce a preselected answer. It is to detect regressions in **decision behavior**.

All public inputs committed to this repository must be synthetic, generic, and safe to publish. Real founder, customer, or company benchmarks belong in a separate private repository or workspace.

## Isolation model

Evaluation now uses three distinct artifacts:

- `cases/<case-id>/case.yaml` — canonical public input visible to the run;
- `evals/reference/<case-id>.yaml` — evaluator-only expectations, forbidden during the run;
- `evals/runs/<run-id>/` — immutable record of one execution after it is frozen.

The Case Library is broader than the benchmark suite. A case only becomes part of the scored regression suite when a maintainer adds a matching evaluator reference under `evals/reference/`.

The active agent must never read `evals/reference/`, previous runs, or git history to infer expected answers. If reference content has already leaked into the active session, mark that run contaminated and start a fresh session.

## Canonical user workflow

### 1. Create

In Claude Code:

```text
/eval-new inventory-monitoring-saas claude-opus-5
```

`eval-new` wraps the deterministic `npm run eval:new` primitive, validates the canonical Case Library entry, snapshots it into the run, and returns a run ID. It deliberately does not execute the benchmark in the same session.

### 2. Run — fresh Claude Code session

```text
/eval-run <run-id>
```

### 3. Freeze

```text
/eval-freeze <run-id>
```

### 4. Score — another fresh Claude Code session

```text
/eval-score <run-id>
```

Only this stage may read `evals/reference/<case>.yaml` after integrity verification. Scoring requires a matching evaluator reference; ordinary Case Library entries do not.

### Low-level primitives

```bash
npm run eval:new -- <case> <model-label>
npm run evidence:check -- evals/runs/<run-id>/venture
npm run eval:freeze -- <run-id>
npm run eval:verify -- <run-id>
```

These are implementation primitives, not a second human workflow to memorize.

## What to evaluate

For each run, evaluate whether Venture OS:

1. identifies the critical uncertainties;
2. discovers major existing alternatives;
3. separates facts from assumptions;
4. searches for disconfirming evidence;
5. avoids treating a large market as direct validation;
6. avoids premature product scope;
7. proposes a cheap experiment when evidence is insufficient;
8. preserves uncertainty instead of inventing confidence;
9. produces an auditable gate decision;
10. changes its conclusion appropriately when contradictory evidence is present.

## Scoring the system, not the venture

Use a 0–2 score for each behavior:

- 0: missed or materially wrong;
- 1: partially handled;
- 2: handled clearly and correctly.

The maximum behavior score is 20. This measures **Venture OS behavior**, not venture attractiveness.

Reference expectations are coverage checks, not exact-answer keys. Stronger or differently worded discoveries should receive credit when they address the same underlying uncertainty.

## Public benchmark suite

The current scored public suite deliberately spans different archetypes:

- inventory monitoring B2B SaaS;
- local home-services marketplace;
- personalized physical product;
- developer cost-monitoring tool;
- consumer learning subscription.

Their canonical input lives in `cases/`; their evaluator-only coverage expectations live in `evals/reference/`.

A methodology that only works for one business model is not yet a general Venture OS.

## Private benchmark boundary

Do not commit real venture names, customer information, proprietary research, private outcomes, or evaluator references derived from sensitive projects here. Keep those benchmarks outside this repository and run them against a pinned Venture OS commit.

This gives the project three useful layers:

- **public Case Library** — open, reusable inputs that contributors can extend;
- **public regression subset** — cases with maintainer-owned evaluator references;
- **private holdout suite** — unseen real-world cases that reduce benchmark overfitting.

See `docs/PUBLICATION.md`.

## Regression protocol

When changing a skill or agent:

1. create a run with `/eval-new` so commit provenance is recorded;
2. execute each benchmark in a fresh session with `/eval-run`;
3. freeze each run with `/eval-freeze`;
4. score in a fresh session with `/eval-score`;
5. compare against previous frozen runs;
6. keep changes that improve general behavior rather than one case only.

Do not optimize prompts for the literal wording of reference files. Encoding the expected answer is a methodology regression even if the score improves.
