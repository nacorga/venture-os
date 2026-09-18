# Contributing to Venture OS

Thanks for helping improve Venture OS.

The easiest contribution is a new public case for the Case Library. A case is a starting business idea or problem context, not an expected answer.

## Before you start

Use Node.js 24 or newer. If you use nvm, the repository includes `.nvmrc` so `nvm use` selects the supported major version.

Install dependencies from the committed lockfile and run the repository checks:

```bash
npm ci
npm test
npm run repo:check
npm run case:validate
```

## Add a case

Create a minimal valid case:

```bash
npm run case:new -- <id> "<title>" "<statement>" <category>
```

Example:

```bash
npm run case:new -- invoice-reconciliation-saas \
  "Invoice reconciliation for small finance teams" \
  "A B2B SaaS that helps small finance teams detect mismatches between invoices, payments, and accounting records." \
  b2b-saas \
  --tag finance \
  --tag reconciliation
```

This creates:

```text
cases/<id>/case.yaml
```

See `docs/CASE_FORMAT.md` for the canonical contract and accepted categories.

## What a good case looks like

A good case is:

- self-contained;
- understandable without private context;
- specific enough to investigate;
- neutral about the conclusion Venture OS should reach;
- materially different from existing cases when possible;
- safe to publish.

Do not add expected assumptions, expected gates, anti-patterns, scores, model settings, or other evaluator hints to `case.yaml`.

## Privacy and provenance

Use the correct `provenance.type`:

- `synthetic` for invented cases;
- `anonymized-real` for real situations with identifying/private details removed;
- `public-real` for cases based on public information; these require `source_url`.

Do not contribute customer data, private company information, proprietary metrics, confidential research, credentials, or material that could reasonably re-identify a private source.

`anonymized-real` cases require human judgment. Passing schema validation does not prove that anonymization is safe. The intended future assisted anonymization/publication boundary is documented in `docs/CASE_PUBLISHING.md`.

## Validate your contribution

Run:

```bash
npm test
npm run case:validate -- <id>
npm run case:validate
npm run repo:check
```

All commands must pass before opening a pull request.

## Benchmark references are maintainer-owned

Do not create or modify `evals/reference/` — including the reveal pairs under `evals/reference/reveal/` — just to contribute a case.

The Case Library is broader than the regression benchmark suite. Maintainers may later add a separate evaluator reference when a case provides useful regression coverage. Keeping that decision separate prevents contributors from encoding the expected answer into the input.

## Pull request scope

Prefer one focused contribution per pull request. For a case-only contribution, the expected diff is usually just:

```text
cases/<id>/case.yaml
```

Explain briefly why the case adds useful coverage and disclose whether it is synthetic, anonymized-real, or public-real.

## Framework changes

Changes to agents, skills, gates, evidence rules, schemas, or scoring have a higher regression risk than adding a case. Keep those changes separate from case contributions and explain the behavioral reason for the change.

A framework change follows the regression protocol in [`evals/README.md`](evals/README.md) § Regression protocol: it names the run and failure that motivated it, shows that the originating case no longer exhibits it, and shows that no other case got worse in blind comparison or mechanical verdicts.

## License

By contributing, you agree that your contribution is licensed under the repository's MIT License.
