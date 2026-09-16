# First real test

Use a venture you already understand well. That gives you a human benchmark for whether Venture OS catches important risks without being coached toward the answer.

## 1. Create it

```bash
npm run venture:new -- first-test "<one sentence idea>"
claude
```

## 2. In Claude Code

Run one phase at a time using skills directly:

```text
/venture-new ventures/first-test
/venture-research ventures/first-test
/venture-challenge ventures/first-test
/venture-decide ventures/first-test
```

Do not replace these with copied long-form prompts. The skill body is the procedural source of truth; pass only the venture path or other dynamic arguments.

Inspect the artifact after each phase before invoking the next skill.

## 3. Review Venture OS itself

After the run, answer these manually:

- What did it find that you had missed?
- What important issue did it miss?
- Where was it generic?
- Where did it overstate evidence?
- Did it try to build too early?
- Was the gate decision traceable to evidence?
- Would the recommended next experiment materially change your decision?

Record failures before editing agents or skills. Fix patterns, not one-off wording.

## 4. Recommended first comparison

Run the same venture in a fresh Claude Code session after any major skill change and compare the artifacts. Do not optimize until you can name the behavioral regression you are trying to fix.

If you find yourself writing the same instructions to Claude again, stop and move that procedure into a project skill instead.
