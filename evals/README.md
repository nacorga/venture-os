# Venture OS Evals

The purpose of evals is not to prove that an LLM can reproduce a preselected answer. It is to detect regressions in **decision behavior**.

All public inputs committed to this repository must be synthetic, generic, and safe to publish. Real founder, customer, or company benchmarks belong in a separate private repository or workspace.

## Isolation model

Evaluation uses four distinct artifact classes:

- `cases/<case-id>/case.yaml` — canonical public input visible to the run;
- `evals/reference/<case-id>.yaml` — evaluator-only expectations, forbidden during the run;
- `evals/runs/<run-id>/` — record of one execution;
- `evals/runs/<run-id>/evaluator/` — evaluator reference, rubric and scoring contract copied **only when the run is frozen**;
- `evals/runs/<run-id>/scores/<judge-label>.md` — one file per independent judge, written after freeze.

The Case Library is broader than the benchmark suite. A case only becomes part of the scored regression suite when a maintainer adds a matching evaluator reference under `evals/reference/`.

The active agent must never read `evals/reference/`, previous runs, evaluator bundles, or git history to infer expected answers. If reference content has already leaked into the active session, mark that run contaminated and start a fresh session.

## Reproducibility model

`eval:new` records the effective runtime, not only `HEAD`:

- git commit;
- whether the worktree was dirty;
- a SHA-256 of the Venture OS runtime files used by the run;
- a SHA-256 of the case snapshot;
- hashes of the evaluator reference, rubric and scoring skill without exposing their contents to the active agent;
- the user-supplied model label.

`eval:freeze` refuses to freeze if the case or effective runtime changed after creation, if evaluator sources changed, if canonical venture state is schema-invalid, if no complete gate decision exists, or if `evidence:check` fails.

When the decision's next action is an experiment, freeze also requires that experiment to be designed and locked with success and failure rules that name the gate outcome they lead to — otherwise a later result could not be checked against it.

Only after those checks pass does freeze create `evaluator/` and copy the evaluator-only inputs into the run. The frozen digest includes that evaluator bundle. `scores/` — and a legacy root `SCORE.md` — remains outside the digest, so any number of independent judges can score a run without mutating it. Freeze refuses a run that already has scores or an evaluator bundle, and any symbolic link: a frozen run holds regular files only.

This separates three questions that should not be conflated:

1. **artifact integrity** — did frozen files change?;
2. **run validity** — did the run finish with internally consistent canonical state?;
3. **evaluation provenance** — which framework, reference, rubric and scoring contract produced the score?

## Canonical user workflow

### 1. Create

In Claude Code:

```text
/eval-new inventory-monitoring-saas claude-opus-5
```

`eval-new` wraps the deterministic `npm run eval:new` primitive, validates the canonical Case Library entry, snapshots it into the run, records effective runtime provenance, and returns a run ID. It deliberately does not execute the benchmark in the same session.

### 2. Run — fresh Claude Code session

```text
/eval-run <run-id>
```

### 3. Freeze

```text
/eval-freeze <run-id>
```

Freeze performs semantic validation before creating the immutable marker and evaluator bundle.

### 4. Score — another fresh Claude Code session per judge

```text
/eval-score <run-id> <judge-label>
```

Each judge writes `scores/<judge-label>.md` and does not read another judge's score until its own is drafted. Two judges on the same run are what make a disagreement visible; one judge's total is not evidence of anything. Scoring reads only the frozen evaluator bundle for that run. It must not silently substitute the repository's current reference or current rubric.

### Low-level primitives

```bash
npm run eval:new -- <case> <model-label> [--suite <path>]
npm run evidence:check -- evals/runs/<run-id>/venture
npm run eval:freeze -- <run-id> [--suite <path>]
npm run eval:verify -- <run-id>
```

These are implementation primitives, not a second human workflow to memorize.

## What is scored

The behavior rubric — the ten behaviors and their 0–2 scale — lives in [`RUBRIC.md`](RUBRIC.md). It is an evaluator source: hashed at `eval:new`, copied into the run's `evaluator/` bundle at freeze, and read by judges only from that frozen copy.

## Public benchmark suite

The current scored public suite deliberately spans different archetypes:

- inventory monitoring B2B SaaS;
- local home-services marketplace;
- personalized physical product;
- developer cost-monitoring tool;
- consumer learning subscription.

Their canonical input lives in `cases/`; their evaluator-only coverage expectations live in `evals/reference/`.

A methodology that only works for one business model is not yet a general Venture OS.

### Full-cycle regression

First-decision benchmarks are necessary but not sufficient. The deterministic suite also exercises a sequential integrity cycle: an initial decision is preserved, contradictory evidence arrives, operational state advances through learning, and a second decision is recorded without rewriting the first snapshot.

This catches history-preservation and state-transition regressions. A future model-level benchmark should extend the public scored suite with staged evidence reveals so behavior 10 is measured directly rather than inferred from a single decision.

## Private benchmark boundary

Do not commit real venture names, customer information, proprietary research, private outcomes, or evaluator references derived from sensitive projects here. Keep those benchmarks outside this repository and run them against a pinned Venture OS commit or recorded effective runtime hash.

A private suite is a directory laid out like this repository — `cases/<id>/case.yaml` and `evals/reference/<id>.yaml`. Pass it to `/eval-new` and `/eval-freeze` with `--suite <path>`. Runs are still written under this checkout's `evals/runs/`, which is gitignored, and belong back in the suite's own storage once scored. Only the suite's directory name reaches the run, because the agent under test reads `metadata.json`.

This gives the project three useful layers:

- **public Case Library** — open, reusable inputs that contributors can extend;
- **public regression subset** — cases with maintainer-owned evaluator references;
- **private holdout suite** — unseen real-world cases that reduce benchmark overfitting.

See `docs/PUBLICATION.md`.

## Regression protocol

When changing a skill or agent:

1. create a run with `/eval-new` so effective runtime and evaluator-source provenance are recorded;
2. execute each benchmark in a fresh session with `/eval-run`;
3. freeze each run with `/eval-freeze`;
4. score each run in a fresh session per judge with `/eval-score <run-id> <judge-label>`, using only the frozen evaluator bundle;
5. compare against previous frozen runs;
6. keep changes that improve general behavior rather than one case only.

Do not optimize prompts for the literal wording of reference files. Encoding the expected answer is a methodology regression even if the score improves.
