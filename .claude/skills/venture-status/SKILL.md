---
name: venture-status
description: Summarizes the current Venture OS state, strongest evidence, critical unknowns, latest decision, and next action without doing new research. Use when resuming a venture or asking what should happen next.
argument-hint: <venture-dir>
---

# Venture Status

Target venture directory: `$ARGUMENTS`

Read the target venture state plus the latest decision and experiment/learning artifacts.

Return a compact status containing:
- current stage;
- latest gate decision;
- thesis in one paragraph;
- 3 strongest pieces of evidence;
- 3 most important unresolved assumptions or risks;
- explicit do-not-build items;
- the canonical `next_action` and why it is next.

Do not perform new external research unless explicitly requested.
