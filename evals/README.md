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

Each judge writes `scores/<judge-label>.md`, ending in the machine-readable block the frozen rubric defines, and does not read another judge's score until its own is drafted. Two judges on the same run are what make a disagreement visible; one judge's total is not evidence of anything. Scoring reads only the frozen evaluator bundle for that run. It must not silently substitute the repository's current reference or current rubric.

### Low-level primitives

```bash
npm run eval:new -- <case> <model-label> [--suite <path>]
npm run evidence:check -- evals/runs/<run-id>/venture
npm run eval:freeze -- <run-id> [--suite <path>]
npm run eval:verify -- <run-id>
npm run eval:fork -- <run-id> --arm <arm> [--rep <n>] [--suite <path>] [--model-label <label>] [--cross-framework]
npm run eval:verdict -- <run-id> [--facts-only]
npm run eval:compare -- <run-a> <run-b>
npm run eval:compare -- --unblind <compare-id>
npm run eval:summary -- [--runs <dir>] [--compare <dir>] [--case <id>]
```

These are implementation primitives, not a second human workflow to memorize.

## What is scored

The behavior rubric lives in [`RUBRIC.md`](RUBRIC.md). It is an evaluator source: hashed at `eval:new`, copied into the run's `evaluator/` bundle at freeze, and read by judges only from that frozen copy.

It judges eight behaviors 0–2 and leaves two to scripts: whether the decision is auditable, which freeze enforces, and whether contradictory evidence changes the analysis, which staged reveals measure directly. Its total is a **floor alarm**. Four runs of an earlier rubric scored 20, 19, 19 and 19 out of 20: a strong run lands at the top, and the gap between two strong runs is smaller than the gap between two judges. What discriminates is:

1. **mechanical verdicts** on forked runs — did the second decision follow the run's own preregistration, keep a planted pair in order, stay out of a trap (§ Staged evidence reveal);
2. **blind pairwise comparison** — a judge prefers one of two anonymised runs of the same case per behavior, and only then learns which was which (§ Comparing two versions);
3. **the spread between judges** — two judges per run make a score's noise visible; an item where they differ by more than one point is not evidence of anything until it is resolved.

A judge reads `scores/facts.json` (`npm run eval:verdict -- <run-id> --facts-only`) instead of recounting the evidence index by hand, and never reads a mechanical verdict before its own score is fixed.

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

This catches history-preservation and state-transition regressions. What it cannot catch is a model that records the second decision correctly and makes it badly — that is what staged reveals measure.

### Staged evidence reveal

A frozen run can be **forked**: the fork copies its venture state and first decision, is shown one packet of evidence the first phase never saw, and must make a second decision. Whether that decision was the right one is then checked by a script, not by a judge.

```bash
npm run eval:fork -- <run-id> --arm <arm> [--rep <n>] [--suite <path>] [--model-label <label>] [--cross-framework]
```

Two kinds of arm:

- **`prereg-failure` and `prereg-success`** reveal the results of the run's own locked experiment: the branch's preregistered signals were met, the others were not, plus one fixed distraction that pulls the other way. The packet is built from the locked design, with no model involved. The verdict checks that the run classified the branch it was shown, that its second decision is the outcome its own locked rule assigns to that branch, and that the decision file records the routing.
- **`P###-a` and `P###-b`** reveal a planted **reveal pair** from `evals/reference/reveal/<case>/P###.yaml`: two arms identical but for one decisive fact. The pair file also carries evaluator-only expectations — which outcomes each arm may or may not end in, which arm must end higher (`PARK` < `TEST` < `PROCEED`), and **traps**: packet items whose evidence must not be recorded above a strength, or must carry a derivation, each naming the real failure it was written from. Only an arm's summary and items reach the run; the file is copied into the fork's `evaluator/` only at freeze.

Each fork is its own run with an opaque ID, `<run-id>--<8 hex>`. Which arm it was shown is recorded only in a sealed key, `evals/runs/.keys/<fork-id>.json`: the fork's own files say nothing about its arm, because the run under test reads them. Like `evals/reference/`, the key directory is closed to runs by rule. A fork continues in a fresh session with `/eval-continue <fork-id>` and is frozen with `/eval-freeze`, which checks it against its frozen parent rather than against anything the fork could edit: every phase-1 file byte for byte, every earlier evidence record and assumption, every experiment's preregistration, and the packet rebuilt from the parent's experiment or the suite's pair. Freeze also refuses a fork that made no new decision or left a packet item uncited, and a run that carries a fork's files without a key. It is judged with:

```bash
npm run eval:verdict -- <fork-id>     # scores/mechanical.json
npm run eval:verdict -- <run-id>      # scores/pairs.json: ordered, tied or inverted
```

A pair verdict only pairs forks of the same parent, the same version of the pair, the same `--rep` and the same framework. A fork must be frozen while its parent is still under `evals/runs/`.

The public suite carries one pair for `inventory-monitoring-saas` and one for `home-services-marketplace`. More are added when a run has failed an existing one, not before: a pair every run passes is the saturation this section exists to escape, and public pairs wear out once models have read them. The private holdout is where most discrimination should live.

A tied pair does not fail; it says the pair did not discriminate. An inverted pair fails. `--cross-framework` forks a run frozen on one framework into a second phase on another, which is the lowest-noise way to test a change to how Venture OS decides: both versions start from the same phase-1 state. Pair verdicts never mix frameworks.

### Comparing two versions

```bash
npm run eval:compare -- <run-a> <run-b>
```

builds `evals/compare/<compare-id>/` (gitignored): both runs' artifacts under the neutral names `X/` and `Y/`, the case, and a comparison rubric of its own, so runs frozen under different rubrics compare on one standard. Which run is which is sealed in `evals/compare/.keys/`, with a commitment in the comparison's manifest so the key cannot be edited afterwards unnoticed. Each judge, in a fresh session:

```text
/eval-compare <compare-id> <judge-label>
```

prefers X, Y or a tie per behavior, quoting both runs. Unblinding happens outside judge sessions and maps each preference back to its run:

```bash
npm run eval:compare -- --unblind <compare-id>
```

Comparing two runs of the same framework (an A/A comparison) is how the noise of the comparison itself is measured: preferences that split one way across A/A pairs as often as across A/B pairs are noise.

`npm run eval:summary` reads everything above across frozen runs — judged items with their spread, mechanical verdicts, pair verdicts, unblinded comparisons and fact-sheet alarms — and prints one report. `--runs` and `--compare` point it at an archive, such as a private suite's.

## Private benchmark boundary

Do not commit real venture names, customer information, proprietary research, private outcomes, or evaluator references derived from sensitive projects here. Keep those benchmarks outside this repository and run them against a pinned Venture OS commit or recorded effective runtime hash.

A private suite is a directory laid out like this repository — `cases/<id>/case.yaml` and `evals/reference/<id>.yaml`. Pass it to `/eval-new` and `/eval-freeze` with `--suite <path>`. Runs are still written under this checkout's `evals/runs/`, which is gitignored, and belong back in the suite's own storage once scored. Only the suite's directory name reaches the run, because the agent under test reads `metadata.json`.

This gives the project three useful layers:

- **public Case Library** — open, reusable inputs that contributors can extend;
- **public regression subset** — cases with maintainer-owned evaluator references;
- **private holdout suite** — unseen real-world cases that reduce benchmark overfitting.

See `docs/PUBLICATION.md`.

## Regression protocol

Every change to a skill, agent, gate, evidence rule, schema or scoring contract names the run and the failure that motivated it, and ships with evidence that it fixed that failure without breaking anything else:

1. **Baseline.** On the commit before the change, the affected cases have frozen runs, two judges on each first-phase run, and preregistration forks on each `TEST`. Existing frozen runs serve when their framework is the one being changed.
2. **The originating case.** On the changed framework, re-run the case the failure came from. The failure must be gone, shown by a mechanical verdict where one covers it and by the judges' failure-mode sections where none does.
3. **No regression elsewhere.** For behaviors that decide — how research, challenge, decision and learning behave — fork the baseline's frozen parents with `--cross-framework` and compare the second phases' verdicts. For everything else, run at least one other case on the changed framework and compare it blind against its baseline with `/eval-compare`. A change that loses more blind comparisons than it wins does not merge.
4. **Record it.** The pull request states the originating run, the verdicts and comparisons before and after, and `npm run eval:summary` output for the cases involved.

Do not optimize prompts for the literal wording of reference files or reveal pairs. Encoding the expected answer is a methodology regression even if every verdict passes.
