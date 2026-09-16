# Decision <ID> — <date>

## Question

What stage decision are we making?

## Outcome

`PROCEED | TEST | PARK`

## Decisive evidence

Evidence IDs and why they matter.

## Contradictory evidence

Evidence IDs that push in the opposite direction.

## Open critical assumptions

Assumptions that remain unresolved.

## Blocking assumptions and deferrals

List the canonical `blocking_assumptions`. Identify the one targeted by `next_action.assumption_id`. For every additional blocker, copy its `blocking_deferrals` reason (and `until` when present) from `venture.yaml`. A blocker with no current action or explicit deferral is an invalid state, not a narrative gap to paper over here.

## Rationale

Concise explanation of why this outcome is justified now.

## Canonical state projection

This block is a projection of `venture.yaml`, not an independently authored summary. Update canonical state first, then copy these values exactly.

<!-- venture-state-projection:start -->
decision_id: <D###>
next_action_id: <N###>
do_not_build_ids: [<DNB###>]
revisit_when_ids: [<T###>]
reopen_rule_refs: [<T###>]
<!-- venture-state-projection:end -->

## Next action

Copy the canonical `next_action.instruction` and its success/failure signals. Do not paraphrase or add a second action.

## Do not build

Reference stable `DNB###` IDs. Never cite these by ordinal position.

## Revisit when

For PARK, reference stable `T###` IDs and reproduce the canonical combination rule semantically. Never use "Trigger 1", "item 4", or other positional references.

## Supersedes

Previous decision ID if applicable. Never delete the old record.
