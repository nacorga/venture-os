---
name: venture-research
description: Runs evidence-first market, customer, competitor, pricing, and risk research for an existing Venture OS venture. Use after venture-new or whenever critical assumptions need external evidence.
argument-hint: <venture-dir>
---

# Venture Research

Target venture directory: `$ARGUMENTS`

Read the target venture state plus `framework/evidence-standard.md` and `framework/anti-bias.md`.

## Goal

Replace important assumptions with sourced evidence where possible and expose what remains unknown.

## Workflow

1. Identify the venture's top critical assumptions.
2. Re-check the primary segment before research. If it combines populations that could differ on the quantities the critical assumptions depend on, split the segment before collecting evidence or record an explicit justification for treating them as one population.
3. Write a short research plan mapped to those assumptions.
4. Delegate independent workstreams to `market-researcher` and `competitor-analyst` when parallel research is useful.
5. Research disconfirming evidence, not only supportive evidence.
6. Persist an evidence record for each material finding. One record carries one source, and everything its statement asserts must be found there (`framework/evidence-standard.md` § One record, one source). Use stable IDs such as `E001`, `E002` and give the record an explicit `segment` whenever it is linked to a segment-scoped assumption.
7. Before linking any evidence record to an assumption, check two things independently:
   - **segment transport:** if the evidence segment differs from the assumption segment, either add a concrete `transport_justification` to the evidence record explaining why the finding transfers, or leave the record unlinked;
   - **claim transport:** confirm the evidence measures the quantity the assumption actually asserts. A price or turnaround record is not evidence of cadence, retention, prevalence, or willingness to pay merely because it concerns the same buyer.
8. Create `research/YYYY-MM-DD-research.md` using `templates/research-report.md`.
9. Update assumption evidence strength without deleting contradictory evidence.
10. Run `npm run evidence:check -- $ARGUMENTS` before leaving research. Repair any segment/link defect here rather than relying on the later gate audit to catch it.
11. Move the venture stage to `research` when substantive evidence exists.
12. Replace `next_action` with the next stable `N###` object whose single instruction is to challenge the thesis. Set `type: challenge`; point `assumption_id` at the most decision-relevant unresolved assumption when one clearly dominates, otherwise null. Keep `depends_on: []` in version 2.

## Quality bar

A useful report says what changed in our beliefs. Avoid generic market descriptions that do not inform a decision. Segment precision must be applied to the venture's own ICP as rigorously as it is applied to external evidence.

## Completion criteria

Every critical assumption is either supported, contradicted, mixed, or still unknown, with the most decision-relevant evidence traceable to sources; segment and claim transport have been checked before linkage; and canonical state passes `evidence:check`.
