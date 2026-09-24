# Venture OS Evals

The purpose of evals is not to prove that an LLM can reproduce a preselected answer. It is to detect regressions in **decision behavior**.

All public inputs committed to this repository must be synthetic, generic, and safe to publish. Real founder, customer, or company benchmarks belong in a separate private repository or workspace.

## Isolation model

Evaluation keeps these artifacts apart:

- `cases/<case-id>/case.yaml` — canonical public input visible to the run;
- `evals/reference/<case-id>.yaml` — evaluator-only expectations, forbidden during the run;
- `evals/runs/<run-id>/` — record of one execution;
- `evals/runs/<run-id>/evaluator/` — evaluator reference, rubric and scoring contract copied **only when the run is frozen**;
- `evals/runs/<run-id>/scores/<judge-label>.md` — one file per independent judge, written after freeze;
- `evals/runs/<run-id>/telemetry.json` — how the unattended session that produced the run was configured, what it cost and what it was denied, sealed by freeze; a judge's own sits beside its score as `<judge-label>.telemetry.json` (§ Unattended sessions).

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

### Unattended sessions

Steps 2 and 4, a fork's second phase and a blind comparison's judges can also run with no one at the keyboard. Creating runs, forks and comparisons, verdicts and unblinding stay the commands above.

```bash
node scripts/eval-batch.mjs run <run-id|fork-id>... --model <model> --effort <level> [--suite <path>] [--jobs <n>]
node scripts/eval-batch.mjs score <judge-label> <run-id>... --model <model> --effort <level> [--jobs <n>]
node scripts/eval-batch.mjs compare <judge-label> <compare-id>... --model <model> --effort <level> [--jobs <n>]
```

Each session is a fresh `claude -p` process started from this checkout. It loads this project's settings, skills, agents and `CLAUDE.md` and nothing else: not the operator's `CLAUDE.md` or rules, a `CLAUDE.local.md`, a `CLAUDE.md` in a directory above the checkout, plugins, MCP servers or auto-memory — all of which a session opened by hand loads and no hash records. A session that did not load every project skill and agent, or loaded a plugin or an MCP server, is stopped as soon as it reports its configuration. Before any run is taken, one probe session is started and stopped the same way, so a CLI update that enables a new plugin, or an account that cannot start the model, fails the batch once instead of every session in it. The CLI's builtin plugins are off by name, because no listing shows them.

Sessions run in `dontAsk` mode with a fixed list of tools per kind of session, `allowedTools` in the script: a call outside the list is denied and recorded, never approved, and only the CLI's built-in read-only commands pass unlisted. A session writes only inside its own directory — a run in its run, a judge in the run's `scores/`, a comparison judge in its `judgments/`. A run may run `evidence:check` and `experiment:lock` and none of the evaluator's scripts. A judge may run only `eval:verify` and `eval:verdict --facts-only`, and is not started on a run whose `scores/` already holds a verdict — judge a run before running `eval:verdict` on it. A comparison judge runs no script. A judge that changes any file beside its own and the fact sheet — another judge's score, a verdict, the artifacts under comparison — fails. Two runs are comparable when they ran under the same list, not when neither was ever denied.

`run` starts `/eval-run`, or `/eval-continue` for a fork, then freezes and verifies the run once its session completes. `score` and `compare` run one judge label over each target. Nothing starts unless every session in the batch can: before any session starts, every run is checked for what freeze would later refuse and a session cannot change — its case, its runtime and evaluator sources, a reserved entry, a fork's parent. A run is only started from what `eval:new` or `eval:fork` left and is never resumed: a session that ran, here or by hand, leaves partial state a second session would read, so the run is replaced by a new one.

Every session writes telemetry when it starts and completes it when it ends — `telemetry.json` in the run, sealed by freeze, and `<judge-label>.telemetry.json` beside a judge's file. It records the configuration above, the model and effort requested, the model the CLI reported, its version, turns, wall time, the cost at list price with usage per model, and every permission denial. A session that was interrupted, or that froze its own run, leaves the record it started with. The runner is not part of the hashed runtime and has no npm alias: `package.json` is hashed, and the tool that runs a framework must not change that framework's hash. Its configuration is recorded run by run instead, and `eval:summary` says when the runs it reads were produced under more than one.

Sessions run one at a time unless `--jobs` says otherwise; parallel sessions share one account's rate limits.

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
npm run eval:summary -- [--runs <dir>] [--compare <dir>] [--bare <dir>] [--case <id>]
node scripts/eval-batch.mjs <run|score|compare> ... --model <model> --effort <level>
node scripts/eval-bare.mjs <case>... --model <model> --effort <level> [--suite <path>] [--pair P001] [--reps <n>] [--jobs <n>]
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
- **`P###-a` and `P###-b`** reveal a planted **reveal pair** from `evals/reference/reveal/<case>/P###.yaml`: two arms identical but for one decisive fact. The pair file also carries evaluator-only expectations — which outcomes each arm may or may not end in, which arm must end higher (`PARK` < `TEST` < `PROCEED`), and **traps**: packet items whose evidence must not be recorded above a strength, or, when linked to an assumption, must carry a derivation — a record that cites the figure only to set it aside is not evidence its model has to support — each naming the real failure it was written from. A trap judges every record that cites its item, so a trapped item holds only the claim the trap is about: an observation beside it — the counts an extrapolation starts from, the incident a cost estimate prices — goes in an item of its own, or an honest record of the observation fails the trap. Only an arm's summary and items reach the run; the file is copied into the fork's `evaluator/` only at freeze.

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

### Against plain Claude

To compare how often Venture OS and Claude without it keep a pair in order, `eval-bare.mjs` gives the same case and the same planted pair to Claude with no Venture OS loaded:

```bash
node scripts/eval-bare.mjs <case>... --model <model> --effort <level> [--suite <path>] [--pair P001] [--reps <n>] [--jobs <n>]
```

One session gets the case's title and statement, researches as it judges useful and ends with a `DECISION:` line; each arm of the pair continues a copy of that session (`--resume --fork-session`) with the arm's summary and items, and decides again. The session runs in a working directory outside this checkout, so no Venture OS instruction, skill or agent loads, under the unattended runner's configuration otherwise — same model and effort, research tools, `dontAsk`, no operator instructions, plugins or MCP servers. Its record, `evals/bare/<id>/result.json` (gitignored), holds the prompts, each phase's answer and telemetry, and the verdict a pair verdict would give: each arm's outcome against the pair's expectations, and the order between the arms. Traps are not scored — a plain answer keeps no evidence records — so the comparison is on decisions alone. The first phase's outcome is not scored either: nothing here says which gate a case deserves.

This measures whether a decision moves the way the pair expects, not whether either decision is right. It cannot show that Venture OS decides better: a Venture OS run commits in advance to the evidence that would change its decision, and a pair written before the run cannot target that evidence.

The v0.3.0 result did not meet the preregistered criterion — Venture OS keeping pairs in order at least 20 percentage points more often than plain Claude, with no inversion. Venture OS kept 7 of 15 pairs in order (47%) and inverted none; plain Claude kept 15 of 21 (71%) and inverted one. Six of Venture OS's eight ties were judged defensible: the pair's decisive fact bore on something the run had already set aside.

### Source fidelity

Whether a claim says what its cited source says is checked by hand, not by a script: claims are sampled with a fixed seed — evidence records from a Venture OS run's final state, sentences carrying a link from a plain answer — shuffled, stripped of anything naming the system, and each is judged against the page it cites by a checker that sees only the claim and its URL. A claim is *faithful* when every figure, date and name it attributes to the source is there, and *absent* when its core fact is not.

On the v0.3.0 private suite, four cases, 40 Venture OS records and 33 plain sentences:

| | Faithful | Core fact absent or contradicted |
|---|---|---|
| Venture OS v0.3.0 | 19 of 40 | 2 of 40 |
| Claude asked plainly | 9 of 33 | 8 of 33 |

The difference in absent facts is the finding (Fisher p = 0.04): a plain answer attributes a figure to a source that does not contain it in about one link in four, Venture OS in about one in twenty. Most of Venture OS's remaining failures were figures from another page filed under a single source, which is what `framework/evidence-standard.md` § One record, one source now forbids. On three of the same cases re-run under that rule, 25 of 30 records were faithful, against 13 of 30 before it (p = 0.003), with absent facts unchanged (2 against 1).

One checker per claim, of the same model family; small samples; and a record's style can give its system away, so the blinding is partial. It measures fidelity to the cited page, not whether the page is right, and plain sentences with no link are outside it.

### Summary report

`npm run eval:summary` reads every record described above — judged items with their spread, mechanical verdicts, pair verdicts, bare runs, unblinded comparisons, session telemetry and fact-sheet alarms — and prints one report. `--runs`, `--compare` and `--bare` point it at an archive, such as a private suite's.

## Private benchmark boundary

Do not commit real venture names, customer information, proprietary research, private outcomes, or evaluator references derived from sensitive projects here. Keep those benchmarks outside this repository and run them against a pinned Venture OS commit or recorded effective runtime hash.

A private suite is a directory laid out like this repository — `cases/<id>/case.yaml` and `evals/reference/<id>.yaml`. Pass it to `/eval-new`, `/eval-freeze` and `eval-batch.mjs run` with `--suite <path>`. Runs are still written under this checkout's `evals/runs/`, which is gitignored, and belong back in the suite's own storage once scored. Only the suite's directory name reaches the run, because the agent under test reads `metadata.json`.

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
