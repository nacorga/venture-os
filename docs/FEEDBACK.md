# Feedback and hosted interest

Venture OS v0.1 should learn from real usage without turning the repository into a telemetry product.

## Default privacy position

Venture OS does not require product analytics or hidden usage telemetry.

The preferred learning loop is explicit, user-submitted feedback through GitHub Issues and Discussions.

Do not ask users to upload private venture artifacts, customer data, credentials, proprietary research, or confidential metrics just to report a problem.

## What we want to learn

For early usage, the most useful signals are:

- did the user create a venture successfully?;
- how far did they get: research, challenge, decision, experiment, learning?;
- did the output change a real decision or next action?;
- what command or concept caused friction?;
- did they reach a real-world experiment?;
- would a hosted version solve meaningful workflow pain?.

Stars, forks, impressions, and compliments are secondary signals.

## How to give feedback

Use the repository **Workflow feedback** issue form for structured usage feedback.

The form asks for workflow context and optional hosted-version interest. GitHub identity is sufficient for follow-up; users should not post email addresses or private business data in public issues.

Use:

- **Bug report** for reproducible defects;
- **Workflow feedback** for onboarding, reasoning, or decision-quality feedback;
- **Case contribution** for a proposed Case Library input when a pull request is not convenient;
- **Discussions** for open-ended questions or community conversation;
- a pull request following `CONTRIBUTING.md` for concrete repository contributions.

## Hosted-product signal

Interest in a future hosted version is intentionally lightweight in v0.1.

Users can indicate `Yes`, `Maybe`, or `No` in the Workflow feedback issue form. This is a demand signal, not a mailing list and not evidence by itself that a hosted product should be built.

Do not add authentication, billing, CRM, or analytics infrastructure merely to collect this signal.

## Maintainer review

Before using feedback as product evidence:

1. distinguish observed behavior from opinion;
2. preserve contradictory feedback;
3. avoid treating one enthusiastic user as prevalence;
4. record recurring onboarding friction separately from feature requests;
5. distinguish inability to use the repository from disagreement with a gate decision;
6. prioritize completed venture/decision/experiment loops over attention metrics;
7. change framework behavior only when a real failure pattern warrants it.

The current M3 goal is not generic awareness. It is evidence from at least 10 external users attempting the Quickstart without live guidance.
