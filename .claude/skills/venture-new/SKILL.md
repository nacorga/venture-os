---
name: venture-new
description: Initializes or normalizes a new Venture OS venture from a short idea. Use when starting a business idea, creating a venture workspace, or turning a rough concept into explicit assumptions before research.
argument-hint: <venture-dir>
---

# Venture New

Target venture directory: `$ARGUMENTS`

If no target was supplied, use the active workflow's explicit venture directory; only default to `ventures/<slug>/` when the context is unambiguous.

Read `framework/methodology.md`, `framework/stages.md`, `framework/evidence-standard.md`, and `templates/venture.yaml`.

## Goal

Create a minimal, falsifiable venture definition without pretending we know more than we do.

## Target directory

Eval runs may intentionally use a directory under `evals/runs/<run-id>/venture/`; do not relocate them into `ventures/`.

## Workflow

1. Identify the target venture directory.
2. If it does not exist, create:
   - `research/`
   - `decisions/`
   - `experiments/`
   - `learning/`
3. Create or normalize `venture.yaml` using the version 2 template.
4. Convert the idea into:
   - problem hypothesis;
   - primary ICP hypothesis;
   - current alternatives hypothesis;
   - solution hypothesis;
   - business model hypothesis;
   - distribution hypothesis.
5. Before writing ICP-scoped assumptions, inspect whether the proposed primary ICP bundles two or more populations that could differ on the quantities the assumptions will turn on (for example buying process, campaign cadence, data availability, price sensitivity, regulation, operational workflow, or retention). If so, either split them into distinct segment labels or record in the thesis why treating them as one segment is causally justified. Do not use one broad `primary-icp` label merely for convenience.
6. Extract 3–7 critical assumptions. Prefer assumptions that could kill the venture if false. Add `segment` whenever the assumption is population- or context-specific and use the decomposed segment labels from step 5.
7. Mark all unverified claims as assumptions, not facts.
8. Set stage to `concept`.
9. Replace the bootstrap action with one structured `next_action` (`N###`) targeting the most important assumption and research step. Keep one primary instruction; use `success_signal` and `failure_signal` only where they can be meaningfully pre-registered. Keep `depends_on: []`; version 2 does not preserve an action graph, so dependencies on historical `N###` IDs are not representable.
10. Keep `blocking_assumptions`, `blocking_deferrals`, `do_not_build`, and `revisit_when` empty unless this step has a concrete reason to populate them; when guardrails are populated they require stable IDs.

## Do not

- perform a full market study in this skill;
- invent TAM, pricing, traction, or customer pain;
- recommend building software;
- assign a numeric venture score;
- write free-text or multi-action `next_action` state;
- collapse materially different customer populations into one segment without an explicit transport rationale.

## Completion criteria

The venture state exists, critical assumptions are explicit, the primary segment is either coherent or decomposed, state uses the version 2 canonical contract, and a new researcher can understand what must be tested without reading the original chat.
