# Venture OS Quickstart

Goal: go from a clean clone to your first auditable venture decision with as little setup friction as possible.

Venture OS is currently Claude Code-first. The quickstart assumes you already have Claude Code installed and authenticated.

## 1. Clone and install

```bash
git clone https://github.com/nacorga/venture-os.git
cd venture-os
npm install
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

Inspect the output between stages. The system is intentionally not a one-command idea validator.

## 4. Read the decision

The canonical current state is:

```text
ventures/my-venture/venture.yaml
```

The decision record is under:

```text
ventures/my-venture/decisions/
```

A valid outcome can be:

- `PROCEED` — evidence justifies moving forward;
- `TEST` — a material uncertainty needs a cheap experiment;
- `PARK` — stop until explicit revisit conditions become true.

There is no required positive outcome. Unknown is valid.

## 5. Continue only if the gate justifies it

For positioning and experiment design:

```text
/venture-position ventures/my-venture
/venture-experiment ventures/my-venture
```

After running an experiment and collecting real evidence:

```text
/venture-learn ventures/my-venture
/venture-decide ventures/my-venture
```

## What to report if something is confusing

The most useful feedback is not “I liked it.” Tell us:

- which command you were running;
- what you expected;
- what blocked or confused you;
- the furthest stage you reached;
- whether the resulting decision changed what you planned to do next.

Use the repository feedback issue template. See `docs/FEEDBACK.md`.

## Next references

- `README.md` — project overview
- `docs/WORKFLOWS.md` — canonical command map
- `framework/methodology.md` — reasoning model
- `CONTRIBUTING.md` — contribute cases or framework changes
