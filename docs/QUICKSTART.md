# Venture OS Quickstart

Goal: go from a clean clone to your first auditable venture decision with as little setup friction as possible.

Venture OS is currently Claude Code-first. This quickstart assumes Claude Code is already installed and authenticated. Use Node.js 24 or newer; if you use nvm, the repository includes `.nvmrc` so `nvm use` selects the supported major version.

## 1. Clone and install

```bash
git clone https://github.com/nacorga/venture-os.git
cd venture-os
npm ci
npm run repo:check
```

Expected final line:

```text
Repository structure OK
```

## 2. Create a venture

Choose a short slug and describe the idea in one sentence:

```bash
npm run venture:new -- my-venture "A B2B SaaS that helps small teams detect costly workflow anomalies before they become incidents"
```

This creates a local workspace under `ventures/my-venture/`.

Do not put secrets, customer data, or confidential research into a venture you intend to commit publicly.

## 3. Start Claude Code

```bash
claude
```

Run these commands one at a time:

```text
/venture-new ventures/my-venture
/venture-research ventures/my-venture
/venture-challenge ventures/my-venture
/venture-decide ventures/my-venture
```

Inspect the output between stages. Venture OS is intentionally not a one-command idea validator.

## 4. Read the decision

The canonical current state is:

```text
ventures/my-venture/venture.yaml
```

Immutable decision records are under:

```text
ventures/my-venture/decisions/
```

A valid gate outcome is exactly one of:

- `PROCEED` — evidence justifies investing in the next stage;
- `TEST` — a material uncertainty needs a cheap credible experiment;
- `PARK` — stop until explicit revisit conditions become true.

There is no required positive outcome. Unknown is valid. The thesis can be reframed as evidence changes, but reframing is not a fourth gate outcome.

## 5. Follow the gate

Do not run every command mechanically.

### If the decision is `PROCEED`

Create evidence-constrained positioning, then design the market-facing experiment:

```text
/venture-position ventures/my-venture
/venture-experiment ventures/my-venture
```

### If the decision is `TEST`

Design the cheapest credible experiment that targets the active blocking assumption:

```text
/venture-experiment ventures/my-venture
```

Do not invent positioning work merely because that command exists.

### If the decision is `PARK`

Stop. Read the recorded `revisit_when` conditions in canonical state. Do not keep testing until one of those conditions or genuinely new evidence justifies reopening the venture.

## 6. Learn from a real experiment

After executing an experiment and collecting real first-party or behavioral evidence:

```text
/venture-learn ventures/my-venture
/venture-decide ventures/my-venture
```

The new gate can confirm, reverse, or narrow the previous direction.

At any point, inspect current state with:

```text
/venture-status ventures/my-venture
```

## What good usage looks like

The goal is not to produce more documents. A useful run changes at least one of:

- what you believe;
- how confident you are;
- what you should test next;
- what you should not build;
- whether the venture should proceed, test, or park.

## What to report if something is confusing

The most useful feedback is not “I liked it.” Tell us:

- which command you were running;
- what you expected;
- what blocked or confused you;
- the furthest stage you reached;
- whether the resulting decision changed what you planned to do next.

Use the repository **Workflow feedback** issue form for structured feedback or Discussions for an open-ended question. See `docs/FEEDBACK.md`.

## Next references

- `README.md` — project overview
- `docs/WORKFLOWS.md` — canonical command map
- `framework/methodology.md` — reasoning model
- `framework/gates.md` — gate semantics
- `CONTRIBUTING.md` — contribute cases or framework changes
