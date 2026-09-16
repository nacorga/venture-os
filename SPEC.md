# Venture OS — Phase 1 Product / Repository Spec

## 1. Objective

Build a private Claude Code-first laboratory that standardizes how a digital business moves from a rough idea to an evidence-backed market experiment.

Phase 1 is successful if repeated real-world use shows that the system improves decision quality, reduces premature building, preserves venture memory, and produces smaller, more decisive experiments.

This repository is not yet the customer-facing product. It is the prototype of the future product's reasoning model, workflows, state model, and evaluation suite.

## 2. Primary user

Initially: one technical founder/operator able to use Claude Code from the terminal and willing to inspect intermediate artifacts.

Later phases may expose the same concepts through a web workspace.

## 3. Phase 1 scope

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
- golden eval cases.

Excluded:
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

`ventures/<slug>/venture.yaml` is the machine-readable current state.

It contains the current thesis, assumptions, evidence index, latest gate decision, blockers, do-not-build list, and next action.

### 4.2 Immutable history

Research, decisions, experiments, and learning are append-oriented artifacts. A later conclusion supersedes an earlier one; it does not erase it.

### 4.3 Skills

Skills are the user-facing reusable workflows. They orchestrate files, subagents, and framework rules.

Initial skills:
- venture-new
- venture-research
- venture-challenge
- venture-decide
- venture-position
- venture-experiment
- venture-learn
- venture-status

### 4.4 Subagents

Subagents provide isolated specialist contexts:
- market-researcher
- competitor-analyst
- challenger
- evidence-auditor
- gatekeeper
- positioning-strategist
- experiment-designer

The parent session owns synthesis and state mutation.

### 4.5 Framework

The framework defines evidence standards, anti-bias rules, gates, experiment design principles, stage semantics, schemas, and templates.

## 5. Workflow

```text
venture-new
  ↓
venture-research
  ↓
venture-challenge
  ↓
venture-decide
      ├─ PARK → stop until revisit condition
      ├─ TEST → venture-experiment → execute → venture-learn → venture-decide
      └─ PROCEED → venture-position → venture-experiment → execute → venture-learn → venture-decide
```

No skill automatically runs the entire pipeline. Human inspection between material stages is a feature, not friction to remove yet.

## 6. Decision model

The system must not answer "is this idea good?" with a single score.

The core decision structure is:
- what do we believe?
- what evidence supports or contradicts it?
- what remains unknown?
- which unknown matters most?
- what is the cheapest credible way to reduce it?
- what should we not build yet?

Gate outcomes are PROCEED, TEST, or PARK.

## 7. Evidence model

Every material venture claim should resolve to fact, inference, assumption, or opinion.

Evidence records must preserve provenance, direction, strength, affected assumptions, and date where freshness matters.

Contradictory evidence remains visible.

## 8. Agent boundaries

Researchers gather evidence but do not issue final venture decisions.
The challenger attacks the thesis but cannot invent objections.
The gatekeeper judges evidence but does not silently add new research.
The positioning strategist cannot invent proof.
The experiment designer cannot default to building software.
The evidence auditor checks claim/source integrity.

## 9. Safety against self-confirming agents

The repository must explicitly resist:
- confirmation bias;
- solution anchoring;
- founder-build bias;
- market-size substitution;
- novelty bias;
- survivorship bias;
- interview politeness;
- AI feature bias.

Research and challenge are separate stages so the same context is not solely responsible for both advocacy and criticism.

## 10. Evals

Golden cases test behavior, not whether the system reproduces an expected final verdict.

A regression suite should measure whether Venture OS:
- identifies fatal unknowns;
- maps real alternatives;
- preserves uncertainty;
- searches for contradictions;
- avoids premature scope;
- proposes actionable experiments;
- changes its mind when new evidence appears.

Run evals in fresh sessions and across more than one model when practical.

## 11. Phase 1 success criteria

After using Venture OS on at least 5 heterogeneous ventures:

- repeated instructions no longer need to be manually restated;
- important risks are discovered consistently;
- outputs reference persistent venture state rather than chat memory;
- the user can resume a venture in a fresh session without losing the reasoning trail;
- the system recommends at least some PARK / TEST outcomes rather than funneling every idea into build;
- experiments are materially cheaper than full product builds for unresolved assumptions;
- changing a skill can be evaluated against golden cases.

## 12. Signals to build the SaaS layer

Consider a web product only when the repository reveals recurring UX pain that a UI would solve, such as:
- difficult navigation of venture memory;
- evidence graph visualization needs;
- comparison across ventures;
- experiment tracking;
- collaboration;
- non-technical users unable to operate the repo;
- repeated manual orchestration that is stable enough to encode.

The web product should emerge from observed repository usage rather than speculative feature design.
