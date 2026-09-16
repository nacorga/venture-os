# Public v0.1 launch checklist

Status: **technical launch complete**. The remaining M3 gate is external usage by people who did not build Venture OS.

This file records the first public-release gate so later work does not accidentally reopen already-completed launch tasks.

## Repository safety — complete

- [x] Current public tree contains only generic, publishable content.
- [x] No secrets, private URLs, customer data, or private venture artifacts are present in the public tree.
- [x] Public history is sanitized; the private development history is not exposed.
- [x] Public repository was created from a fresh sanitized root history rather than by changing visibility on the private repository.
- [x] Private benchmark suite remains stored separately.

See `docs/PUBLICATION.md` for the ongoing repository boundary.

## Clean-checkout onboarding — complete

Validated from a clean checkout with:

```bash
npm install
npm run repo:check
npm run case:validate
npm run venture:new -- onboarding-smoke "A B2B SaaS that helps small teams detect costly workflow anomalies before they become incidents"
npm run venture:check -- onboarding-smoke
```

- [x] `docs/QUICKSTART.md` is usable from a clean clone.
- [x] No undocumented private setup is required for the public workflow.
- [x] Claude Code project skills are the public workflow surface.
- [x] CI is green on the public default branch.

## Community surface — complete

- [x] Issues enabled.
- [x] Bug report form available.
- [x] Case contribution form available.
- [x] Workflow feedback form available.
- [x] Discussions enabled.
- [x] `CONTRIBUTING.md` linked from README.
- [x] Privacy-first feedback policy linked from README.

## Release — complete

- [x] Repository published from sanitized history.
- [x] Public `v0.1.0` release created.
- [x] README links and hero asset resolve from the public repository.
- [x] CI run completed successfully on the public default branch after launch.
- [x] Root commit author uses the GitHub `noreply` address rather than a personal email.

## External user gate — in progress

Invite at least 10 people who did not build Venture OS to try the Quickstart **without live guidance**.

Track useful behavioral outcomes rather than attention metrics:

- [ ] user attempted the Quickstart;
- [ ] venture created;
- [ ] research reached;
- [ ] decision reached;
- [ ] experiment designed or executed;
- [ ] blocking onboarding issue captured when present;
- [ ] whether the workflow changed a real next action captured.

The checklist above describes the observations to collect across the cohort; it is not complete merely because one user reaches each item.

Do not treat stars, forks, impressions, comments, or compliments as substitutes for completed workflows.

## M3 completion condition

M3 is complete only when:

1. the technical launch remains healthy; and
2. at least 10 external users have actually attempted the workflow without live guidance, with enough behavioral feedback to identify the main onboarding and decision-quality failure modes.

Until then, avoid speculative product expansion. Fix demonstrated onboarding or decision-system failures first.
