# Experiment Principles

A good early venture experiment is designed around a **decision**, not around activity.

## Order of preference

When equally informative, prefer:

```text
Observation / outreach
    ↓
Manual or concierge test
    ↓
Landing / fake door / pre-sale
    ↓
Prototype
    ↓
Thin software slice
    ↓
Production system
```

This is not a rigid sequence. Use the cheapest method capable of producing credible evidence for the assumption.

## Behavioral evidence

Prefer what people do over what they say they might do.

Examples of increasing commitment:
- reply;
- booked call;
- supplied real data;
- completed setup;
- introduced a colleague;
- signed LOI with meaningful constraints;
- paid deposit;
- paid and repeatedly used the solution.

No universal conversion threshold defines validation. Thresholds must reflect traffic quality, price, audience, and experiment design.

## Pre-registration

Write success, failure, and ambiguous criteria before results arrive. This reduces post-hoc rationalization.

In Venture OS, pre-registration is executable rather than advisory. Keep an experiment in `designed` status while editing it, then run `npm run experiment:lock -- <experiment.yaml>` immediately before execution. The lock hashes the decision-relevant design and moves it to `running`.

After locking, do not silently edit the target, procedure, budget, signals, or decision rules. If reality forces a deviation, record the deviation and its effect on interpretation; create a new experiment when the design itself must materially change.

## One primary assumption

Experiments may produce secondary learning, but each experiment should have one primary uncertainty that determines its design.
