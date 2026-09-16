# Case format v1

A Venture OS case is a portable, publishable input that describes a business idea or problem context without embedding the answer Venture OS is expected to reach.

The canonical schema is `framework/schemas/case.schema.json`.

## Design goals

A case should be:

- self-contained enough to run without private context;
- small enough for a new contributor to understand immediately;
- reusable across CLI, eval, future UI, and community workflows;
- explicit about provenance;
- safe to publish by construction where possible;
- free of evaluator expectations, scores, preferred gates, or hidden conclusions.

## Canonical location

Case Library entries use:

```text
cases/<case-id>/case.yaml
```

The directory name must equal `id`.

## Create a case

Install dependencies once with `npm ci`, then create a minimal valid case:

```bash
npm run case:new -- <id> "<title>" "<statement>" <category>
```

Example:

```bash
npm run case:new -- inventory-monitoring-saas \
  "Inventory monitoring for small retailers" \
  "A B2B SaaS for small retailers that detects stock anomalies and recommends replenishment actions." \
  b2b-saas \
  --tag inventory \
  --tag retail
```

Optional repeatable flags:

```text
--category <value>
--tag <value>
--constraint <text>
```

Optional single-value flags:

```text
--provenance synthetic|anonymized-real|public-real
--source-url <url>
--audience <text>
--geography <text>
--business-model-notes <text>
```

`--provenance` defaults to `synthetic`. `public-real` requires `--source-url`.

`case:new` validates the generated object against the canonical schema before writing it and refuses to overwrite an existing case directory.

## Validate cases

Validate one case by ID:

```bash
npm run case:validate -- inventory-monitoring-saas
```

Validate an explicit file:

```bash
npm run case:validate -- cases/inventory-monitoring-saas/case.yaml
```

Validate the whole public Case Library:

```bash
npm run case:validate
```

Validation checks YAML parsing, the canonical JSON Schema, `cases/<id>/case.yaml` path consistency, and duplicate IDs when validating the full library.

## Minimal example

```yaml
schema_version: 1
id: inventory-monitoring-saas
title: Inventory monitoring for small retailers
statement: >-
  A B2B SaaS for small retailers that detects stock anomalies and recommends
  replenishment actions before shortages or excess inventory become costly.
categories:
  - b2b-saas
tags:
  - inventory
  - retail
  - anomaly-detection
provenance:
  type: synthetic
```

## Optional context

Only add context that materially changes the problem being evaluated.

```yaml
context:
  audience: Independent retailers operating one to five stores
  geography: Spain
  business_model_notes: Monthly subscription priced per store
  constraints:
    - Must work with incomplete inventory data
    - Initial setup should not require ERP replacement
```

Do not turn `context` into a mini business plan. Unknowns should remain unknown so Venture OS can discover them.

## Fields

### `schema_version`

Required integer. Version 1 uses `1`.

Breaking semantic changes require a new schema version. Existing field meanings must not be repurposed within v1.

### `id`

Required stable kebab-case identifier.

The ID is machine-facing and should survive title or copy changes. It must match the case directory name.

### `title`

Required short human-readable name.

### `statement`

Required self-contained description of the venture or problem presented to Venture OS.

Good statements describe the concept, target workflow, or value proposition without pre-deciding what the research should conclude.

Do not include:

- expected uncertainties;
- anti-patterns the system is supposed to find;
- expected gate (`PROCEED`, `TEST`, `PARK`);
- target score;
- claims that exist only to steer the evaluator;
- hidden answer keys.

Evaluator material belongs outside `case.yaml`.

### `categories`

Required list of one or more broad business archetypes.

Categories are intentionally coarse. They support discovery and coverage analysis, not exhaustive taxonomy.

Current v1 values:

```text
b2b-saas
b2c-saas
consumer-subscription
marketplace
ecommerce
physical-product
developer-tool
service-business
content-media
platform
other
```

Adding a new category that does not change existing semantics is considered backward-compatible within v1.

### `tags`

Required list of zero or more free-form kebab-case tags.

Tags describe domains, workflows, or characteristics such as `retail`, `usage-based-pricing`, or `local-market`.

Do not encode expected conclusions as tags.

### `context`

Optional structured context with:

- `audience`
- `geography`
- `business_model_notes`
- `constraints[]`

Only include facts intentionally supplied to the system as part of the starting state.

### `provenance`

Required object describing where the case came from.

Supported values:

- `synthetic` — invented specifically as a safe public example or benchmark;
- `anonymized-real` — derived from a real situation with identifying/private details removed;
- `public-real` — based on public information; requires `source_url`.

`anonymized-real` is not automatically safe to publish. Human review is still required for re-identification risk, customer data, proprietary metrics, or confidential research.

## Separation from evaluator references

The case is the input, not the answer key.

If a case is also used as a regression benchmark, evaluator expectations remain separate, for example:

```text
cases/inventory-monitoring-saas/case.yaml
evals/reference/inventory-monitoring-saas.yaml
```

The active run must not read the evaluator reference. This preserves the contamination boundary established by the eval harness.

## Compatibility policy

Within schema v1:

- adding optional fields is allowed;
- adding accepted category values is allowed;
- tightening validation in a way that rejects previously valid v1 cases is a breaking change and should be avoided;
- changing the meaning of an existing field is breaking;
- removing or renaming fields is breaking;
- a breaking contract requires `schema_version: 2` and a migration path.

## Deliberately excluded from v1

The following do not belong in the case contract yet:

- expected assumptions or evidence;
- scoring metadata;
- difficulty ratings;
- model/provider configuration;
- experiment outcomes;
- venture state;
- contributor reputation or popularity metrics;
- private attachments.

These concerns can evolve independently without destabilizing the portable case input.
