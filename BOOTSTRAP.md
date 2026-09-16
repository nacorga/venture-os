# Maintainer validation guide

This file is for maintainers validating Venture OS behavior after framework, agent, or skill changes.

If you are trying Venture OS for the first time, use [`docs/QUICKSTART.md`](docs/QUICKSTART.md) instead. The Quickstart is the canonical public onboarding path.

## 1. Choose a known venture

Use a venture you already understand well. That gives you a human benchmark for whether Venture OS catches important risks without being coached toward the answer.

Do not use private/sensitive material in a workspace that will be committed to the public repository.

## 2. Create it

```bash
npm run venture:new -- first-test "<one sentence idea>"
claude
```

## 3. Run the common path in Claude Code

Run one phase at a time using skills directly:

```text
/venture-new ventures/first-test
/venture-research ventures/first-test
/venture-challenge ventures/first-test
/venture-decide ventures/first-test
```

Do not replace these with copied long-form prompts. The skill body is the procedural source of truth; pass only the venture path or other dynamic arguments.

Inspect the artifact after each phase before invoking the next skill.

After the decision, follow the gate-specific path described in `docs/WORKFLOWS.md`; do not mechanically run every skill.

## 4. Review Venture OS itself

After the run, answer these manually:

- What did it find that you had missed?
- What important issue did it miss?
- Where was it generic?
- Where did it overstate evidence?
- Did it try to build too early?
- Was the gate decision traceable to evidence?
- Did contradictory evidence change the analysis appropriately?
- Would the recommended next experiment materially change your decision?
- Did canonical state and projected artifacts stay consistent?

Record failures before editing agents or skills. Fix patterns, not one-off wording.

## 5. Regression discipline

For methodology or behavior changes, use the eval workflow in `evals/README.md` rather than relying only on a familiar venture.

Run comparable cases in fresh Claude Code sessions and compare frozen artifacts. Do not optimize until you can name the behavioral regression you are trying to fix.

If you find yourself writing the same instructions to Claude again, stop and move that procedure into a project skill instead.
