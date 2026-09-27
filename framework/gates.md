# Gates

## Gate outcomes

### PROCEED

Use when evidence is sufficient to invest in the next stage.

PROCEED does not mean the business is validated. It means the expected value of the next stage is justified by current evidence.

### TEST

Use when the opportunity remains plausible but a critical assumption blocks further commitment.

A TEST outcome is incomplete without:
- the blocking assumption;
- why it matters;
- the cheapest credible experiment;
- success and failure signals;
- the downstream decision rule.

### PARK

Use when current evidence does not justify more investment now.

A PARK outcome must record:
- decisive reasons;
- whether the problem, ICP, business model, or timing is the likely issue;
- what evidence would justify reopening the venture.

## Operator threshold

`operator_threshold` in `venture.yaml` is the smallest outcome the operator would pursue: an amount, a unit and a horizon, in the operator's words (for example "€10,000 gross profit a year by year two, at five hours a week or less"). It is the operator's decision, not a finding: it comes from the operator or the case, never from research, and a gate never invents, raises or lowers it.

When it is set, every gate states the plausible ceiling: the most optimistic reading of each factor that current evidence still supports, multiplied out, with the evidence or assumption ID behind each factor. Then:

- ceiling below the threshold → PARK, whatever tests remain open: no experiment result can lift an outcome above a ceiling its own factors cap. The PARK names the factor that caps it and a revisit trigger for the evidence that would raise that factor;
- ceiling at or above the threshold → the threshold decides nothing, and the gate proceeds on the other questions.

When it is null and the outcome would turn on scale (the venture works, but might be too small to be worth it), the gate does not assume a scale for the operator. It records the ceiling it can support and names the missing threshold under open questions, so the operator can close it.

## Gate review questions

1. Is the problem demonstrated or merely plausible?
2. Is the target customer specific enough to test?
3. Are current alternatives understood?
4. Is there evidence of urgency or meaningful cost of the problem?
5. Is willingness to pay known, testable, or irrelevant to the next stage?
6. Is there a plausible distribution path?
7. What evidence contradicts the thesis?
8. What is the most dangerous unknown?
9. Is the proposed next step the cheapest way to learn about it?
10. What should we explicitly not build yet?
11. When `operator_threshold` is set, does the plausible ceiling reach it?

## No aggregate score

A venture may have a strong problem but fatal distribution economics, or weak current evidence but a cheap decisive test. A single 0–100 score hides these structures and must not be the primary decision mechanism.
