# Future case anonymization and publishing

This document defines the intended boundary for future `case:anonymize` and `case:publish` tooling. It is a design contract, not an implemented command surface yet.

## Principle

Publishing a case is a privacy decision, not just a schema-validation step.

No command should claim that a real case is safe to publish automatically. Human review remains mandatory for `anonymized-real` material.

## Future `case:anonymize`

Purpose: turn a private or real case draft into a **reviewable anonymization candidate**, not directly into a public Case Library entry.

Expected behavior:

1. Read an explicit source case/draft.
2. Detect and flag direct identifiers, customer/company names, URLs, proprietary metrics, exact dates, narrow geographies, uncommon workflows, and other re-identification signals.
3. Produce a new candidate rather than mutating the source.
4. Generalize or remove details only when doing so preserves the business uncertainty the case is meant to exercise.
5. Set `provenance.type: anonymized-real`.
6. Emit a human-review checklist describing what was removed/generalized and what residual risks remain.
7. Never create or infer evaluator expectations.

The command should fail closed when it cannot preserve both privacy and the useful meaning of the case.

## Future `case:publish`

Purpose: move an already reviewed candidate into the public `cases/<id>/case.yaml` library.

Expected gates:

1. The candidate passes the canonical case schema.
2. The target `id` is unique.
3. No secrets, credentials, private attachments, internal URLs, or obvious direct identifiers are present.
4. `public-real` includes a public `source_url`.
5. `anonymized-real` includes an explicit human-review acknowledgement.
6. The contributor confirms that they have the right to publish the material.
7. The command writes only the public case input; it does not create `evals/reference/`.
8. The full `case:validate` and `repo:check` suite passes after publication.

## Human review checklist

For an `anonymized-real` case, the reviewer should explicitly consider:

- Can the company, customer, founder, employee, or project be inferred from the remaining details?
- Are exact revenue, traffic, pricing, conversion, contract, or operational metrics proprietary?
- Are dates, geography, integrations, or workflow details rare enough to re-identify the source?
- Does the case contain research or conclusions that were not intended for publication?
- Does removing a sensitive detail materially change the uncertainty being tested?
- Does the contributor have the right to publish the source material?

Passing JSON Schema validation is not evidence that these answers are safe.

## Why publication stays separate from benchmark promotion

Publishing a case makes the **input** public and reusable.

Promoting a case into the scored regression suite is a separate maintainer decision that may add `evals/reference/<case-id>.yaml`. Keeping these steps separate prevents the public contribution workflow from requiring or leaking an answer key.

## Non-goals

The future commands should not:

- guarantee legal compliance or confidentiality safety;
- automatically publish private attachments;
- preserve exact sensitive metrics merely because names were removed;
- generate evaluator references;
- mutate or delete the original private source;
- make publication irreversible.
