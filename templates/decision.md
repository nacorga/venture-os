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

List the decision-time `blocking_assumptions`. Identify the one targeted by the decision-time `next_action.assumption_id`. For every additional blocker, copy its decision-time deferral reason (and `until` when present).

## Rationale

Concise explanation of why this outcome is justified now.

## Pre-registered routing

Only when this decision follows a completed experiment. Name the experiment `X###`, the branch its results fell in (`success`, `failure` or `ambiguous`, as recorded in `results.branch`), and the gate outcome its locked decision rule assigns to that branch. If this outcome differs from the preregistered one, state the new evidence that justifies departing from it. A departure without new evidence is post-hoc rationalization, not a decision.

## Decision snapshot

This block is an immutable snapshot of the decision-time state. It is copied from `latest_decision.snapshot`, not from the current operational fields after the workflow advances.

<!-- venture-state-projection:start -->
decision_id: <D###>
outcome: <PROCEED|TEST|PARK>
snapshot:
  next_action:
    id: <N###>
    type: <type>
    assumption_id: <A###|null>
    instruction: "<instruction>"
    success_signal: <string|null>
    failure_signal: <string|null>
    depends_on: []
  blocking_assumptions: [<A###>]
  blocking_deferrals: []
  do_not_build: []
  revisit_when: []
  reopen_combination_rule: null
<!-- venture-state-projection:end -->

## Next action

Explain the decision-time next action using the immutable snapshot above. Later workflow stages may replace the current canonical `next_action`; do not rewrite this decision when that happens.

## Do not build

Reference stable `DNB###` IDs from the decision snapshot. Never cite these by ordinal position.

## Revisit when

For PARK, reference stable `T###` IDs and reproduce the decision snapshot combination rule semantically. Never use "Trigger 1", "item 4", or other positional references.

## Supersedes

Previous decision ID if applicable. Never delete or rewrite the old record.
