# Evidence Standard

## Evidence classes

### First-party behavioral

Observed behavior in our own experiment: payment, deposit, signup with meaningful commitment, completed workflow, repeated usage, churn, response to outreach, etc.

Usually strongest for the exact venture, but sample size and selection bias still matter.

### First-party qualitative

Direct interviews, sales calls, support messages, objections, recorded workflow observations.

Strong for discovering mechanisms and language. Weak for estimating prevalence without supporting data.

### Primary external

Official pricing, product documentation, public filings, regulator data, company announcements, government statistics, platform docs.

### Secondary external

Reliable reporting, industry analysis, independent research, reputable datasets.

### Community / review evidence

Reviews, Reddit, forums, social posts, niche communities.

Excellent for discovering pains, workflows, and objections. Do not treat anecdotal frequency as market prevalence.

## One record, one source

Every figure, date, name and quoted phrase in a record's `statement` must be found at that record's `source`. A fact read elsewhere — another page, a filing the page links to, a search snippet — goes in its own record with its own source. `notes` may qualify a statement; they never carry a fact the statement or a linked assumption depends on.

A reader must be able to open the one source and find everything the record asserts.

## Evidence direction

Every evidence record should state one of:
- `supports`
- `contradicts`
- `mixed`
- `neutral`

and list the assumption IDs it affects.

## Evidence strength

Allowed values:
- `strong`
- `medium`
- `weak`
- `unknown`

Strength is contextual, not universal. Ten qualified buyers paying a deposit can be stronger for willingness to pay than a large generic market report.

## Segment scope

Evidence must not silently travel between populations, geographies, buyer types, price bands, channels, or operating models.

Use `segment` on an assumption whenever its truth depends on a specific population or context. Before creating ICP-scoped assumptions, decompose a broad ICP into distinct segment labels whenever the included populations could differ on the quantities those assumptions depend on. If multiple populations are intentionally treated as one segment, record the causal justification rather than relying on a convenience label such as `primary-icp`.

Any evidence linked to a segment-scoped assumption should declare its own `segment`. If the evidence segment differs from the assumption segment, either leave it unlinked or record a concrete `transport_justification` explaining why the finding transfers. A shared buyer label is not enough: the evidence must also measure the quantity the assumption asserts.

Every derived quantitative record must declare a `segment`. When a number is valid for one segment but not another, create separate evidence records rather than reusing the same ID with a prose caveat.

## Derived quantitative evidence

A quantitative value produced by calculation, modelling, simulation, extrapolation, or statistical transformation is **derived evidence**, even when its inputs come from strong sources.

Every material derived quantitative record must disclose:

- the model or statistical framing used;
- the formula or method;
- the material inputs;
- the segment to which the result applies;
- the applicability conditions or assumptions that must hold;
- whether it has been independently re-derived or cross-checked;
- any important sensitivity to alternative models or inputs.

Use a `derivation` object on the evidence record when practical.

A derived quantitative record must not be `strong` merely because its inputs are well sourced. Cap it at `medium` until an independent re-derivation, authoritative implementation, or equivalent second check confirms both the arithmetic **and the model's applicability to the problem**.

`npm run evidence:check` enforces the cap: a record with a `derivation` and `strength: strong` fails unless `derivation.independently_verified` is `true` and `derivation.verification_note` says what the second check was. A superseded record is exempt, so supersession remains the repair.

If a derived record materially changes a gate decision, critical assumption, or kill condition, actively attempt a second derivation before relying on it.

## Superseded and corrected evidence

When evidence is corrected, preserve the original record and set `superseded_by: <evidence-id>` rather than deleting history.

The replacement evidence ID must then be propagated to every assumption whose `evidence_ids` still contains the superseded record. Prose artifacts may retain the old reasoning for auditability, but every stale conclusion, figure, or claim must be marked **at the stale site itself** as corrected or superseded. A summary-level "correction applied" block is not sufficient if stale prose remains elsewhere in the artifact.

Run the repository's evidence consistency check after creating a supersession and before a gate decision.

## Freshness

Pricing, regulation, platform capabilities, competitor features, and market statistics can age quickly. Preserve dates.

## Prohibited shortcuts

Do not use these as standalone validation:
- a large TAM;
- high Google search volume;
- social media engagement;
- competitor funding;
- "AI is growing";
- people saying they like the idea;
- a beautiful landing page;
- number of features competitors have.
