# Venture OS — Current Repository Spec v0.1

## 1. Objective

Venture OS is a public, open-source, Claude Code-first operating system for turning a rough business idea into evidence-backed decisions and real-world experiments.

The repository is the current product surface for the reasoning model, workflows, state model, Case Library, and evaluation harness. A hosted or web product is not assumed to be the next step; it should emerge only from recurring workflow pain observed in real usage.

Success means better decisions, less premature building, preserved venture memory, and smaller, more decisive experiments.

## 2. Primary user

Current users are founders, builders, developers, product people, and operators who are comfortable using Claude Code from the terminal and inspecting intermediate artifacts.

Future interfaces may make the same system accessible to non-technical users, but v0.1 is intentionally repository-first and Claude Code-first.

## 3. Current scope

Included:

- venture initialization;
- assumption extraction;
- market and competitor research;
- adversarial challenge;
- evidence audit;
- stage gates;
- positioning;
- experiment design;
- learning ingestion;
- immutable decision logs;
- public Case Library inputs;
- public regression evals with separate evaluator references.

Excluded unless real usage demonstrates the need:

- authentication;
- billing;
- CRM;
- general project management;
- full SaaS generation;
- automated production deployment;
- arbitrary integrations;
- dashboards whose only purpose is visual polish.

## 4. Architecture

The system has five layers.

### 4.1 Venture state

`ventures/<slug>/venture.yaml` is the canonical machine-readable current state.

It contains the thesis, assumptions, evidence index, latest gate decision, blockers, do-not-build list, revisit conditions, and next action.

### 4.2 Immutable history

Research, decisions, experiments, and learning are append-oriented artifacts. A later conclusion supersedes an earlier one; it does not erase it.

Decision records are projections of canonical state, not a second place to invent a different decision.

### 4.3 Skills

Skills are the user-facing repeatable workflows. They orchestrate files, subagents, scripts, and framework rules.

Current venture skills:

- `venture-new`
- `venture-research`
- `venture-challenge`
- `venture-decide`
- `venture-position`
- `venture-experiment`
- `venture-learn`
- `venture-status`

Evaluation lifecycle skills are separate and preserve isolation boundaries between run, freeze, and score: `eval-new`, `eval-run`, `eval-freeze`, `eval-continue` (the second phase of a forked run), `eval-score` and `eval-compare` (one judge of a blind pairwise comparison).

### 4.4 Subagents

Subagents provide isolated specialist contexts:

- market-researcher
- competitor-analyst
- challenger
- evidence-auditor
- gatekeeper
- positioning-strategist
- experiment-designer

The orchestrating session owns synthesis and state mutation.

### 4.5 Framework

The framework defines evidence standards, anti-bias rules, gates, experiment principles, stage semantics, schemas, and templates.

Global invariants belong in `CLAUDE.md` and `framework/`; repeated procedures belong in skills; deterministic mechanics belong in scripts.

## 5. Workflow

The public mental model is:

```text
Idea → Research → Challenge → Decision → Experiment → Learn
```

The canonical branching workflow is:

```text
venture-new
  ↓
venture-research
  ↓
venture-challenge
  ↓
venture-decide
      ├─ PARK    → stop until a recorded revisit condition is met
      ├─ TEST    → venture-experiment → execute → venture-learn → venture-decide
      └─ PROCEED → venture-position → venture-experiment → execute → venture-learn → venture-decide
```

No skill automatically runs the entire pipeline. Human inspection between material stages is intentional.

## 6. Decision model

The system must not answer “is this idea good?” with a single aggregate score.

The core decision structure is:

- what do we believe?;
- what evidence supports or contradicts it?;
- what remains unknown?;
- which unknown matters most?;
- what is the cheapest credible way to reduce it?;
- what should we explicitly not build yet?

Allowed gate outcomes are exactly:

- `PROCEED`
- `TEST`
- `PARK`

A thesis may be reframed as evidence changes, but thesis reframing is not a fourth gate outcome.

## 7. Evidence model

Every material venture claim should resolve to fact, inference, assumption, or opinion.

Evidence records preserve provenance, direction, strength, affected assumptions, segment applicability, and date where freshness matters.

Contradictory evidence remains visible. Unknown is a valid state. Derived quantitative evidence must disclose its model, inputs, applicability, and verification limits.

## 8. Agent boundaries

Researchers gather evidence but do not issue final venture decisions.

The challenger attacks the thesis but cannot invent objections.

The gatekeeper judges evidence but does not silently add new research.

The positioning strategist cannot invent proof.

The experiment designer cannot default to building software.

The evidence auditor checks claim/source integrity and consistency across canonical state and projections.

## 9. Safety against self-confirming agents

The repository explicitly resists:

- confirmation bias;
- solution anchoring;
- founder-build bias;
- market-size substitution;
- novelty bias;
- survivorship bias;
- interview politeness;
- AI feature bias.

Research and challenge are separate stages so the same context is not solely responsible for both advocacy and criticism.

## 10. Case Library and evals

Public reusable inputs live under `cases/<case-id>/case.yaml`.

The Case Library contains inputs, not answer keys. A public case must not encode expected assumptions, expected gates, scores, evaluator hints, or other desired conclusions.

The scored public regression subset has maintainer-owned evaluator expectations under `evals/reference/`. Public evals measure decision behavior, not whether the system reproduces a predetermined final verdict.

The regression suite judges whether Venture OS:

- identifies critical uncertainties;
- discovers major alternatives;
- separates facts from assumptions;
- seeks disconfirming evidence;
- avoids weak market-size proxies;
- avoids premature product scope;
- proposes cheap credible experiments when appropriate;
- preserves uncertainty rather than fabricating certainty.

It checks by script, rather than judging, that gate decisions are auditable and that contradictory evidence changes the analysis. Judged totals are a floor alarm; mechanical verdicts, blind pairwise comparison and the spread between independent judges are what compare two versions of Venture OS.

The rubric itself lives in `evals/RUBRIC.md`. Whether contradictory evidence changes the analysis is measured directly rather than judged: a frozen run can be forked, shown evidence it never saw, and its second decision checked by script against its own preregistration or against a planted reveal pair. Run and score evals in isolated fresh sessions, one per judge — by hand, or unattended through `scripts/eval-batch.mjs`, which fixes each session's configuration and records it with the session's cost — in a run, sealed by freeze. Real or sensitive holdout benchmarks stay outside the public repository, are passed to the harness with `--suite <path>`, and run against a pinned public commit.

## 11. v0.1 success criteria

The technical public-launch gate is complete. The current success criterion is external usage quality, not repository attention.

The first validation target is at least 10 external users who did not build Venture OS attempting the Quickstart without live guidance.

Useful signals include:

- venture created successfully;
- research reached;
- decision reached;
- experiment designed or executed;
- blocking onboarding friction;
- whether the workflow changed a real next action.

Stars, forks, impressions, and compliments are secondary signals.

## 12. Signals for a hosted product

Consider a hosted or web product only when repository usage reveals recurring UX pain that a UI or service would materially solve, such as:

- difficult navigation of venture memory;
- evidence graph visualization needs;
- comparison across ventures;
- experiment tracking;
- collaboration;
- non-technical users unable to operate the repository;
- repeated manual orchestration that is stable enough to encode.

Hosted interest is useful evidence, but it is not sufficient by itself to justify building the hosted product.
