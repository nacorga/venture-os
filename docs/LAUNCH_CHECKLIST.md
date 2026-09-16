# Public v0.1 launch checklist

This checklist is the release gate for making Venture OS public.

## Repository safety

- [ ] Current tree contains only generic, publishable content.
- [ ] No secrets, private URLs, customer data, or private venture artifacts are present.
- [ ] Public history is sanitized. Do not expose the private development history.
- [ ] Prefer a fresh public repository or a deliberately rewritten root history over merely changing visibility on the current private repository.
- [ ] Private benchmark suite remains stored separately.

See `docs/PUBLICATION.md`.

## Clean-checkout onboarding

From a clean checkout:

```bash
npm install
npm run repo:check
npm run case:validate
npm run venture:new -- onboarding-smoke "A B2B SaaS that helps small teams detect costly workflow anomalies before they become incidents"
npm run venture:check -- onboarding-smoke
```

Then confirm Claude Code exposes the project skills and the Quickstart can reach a decision without private context.

- [ ] `docs/QUICKSTART.md` is accurate from a clean clone.
- [ ] No undocumented local setup is required.
- [ ] CI is green.

## Community surface

- [ ] Issues enabled.
- [ ] Bug report form available.
- [ ] Case contribution form available.
- [ ] Feedback form available.
- [ ] Discussions enabled if we want open-ended community conversation.
- [ ] `CONTRIBUTING.md` is linked from README.
- [ ] Privacy-first feedback policy is linked from README.

## Release

- [ ] Repository published from sanitized history.
- [ ] Create/tag public `v0.1.0` release after the clean public repository is verified.
- [ ] README links resolve from the public repository.
- [ ] Run CI once on the public default branch.

## External user gate

Invite at least 10 people who did not build Venture OS to try the Quickstart without live guidance.

Track only useful behavioral outcomes:

- venture created;
- research reached;
- decision reached;
- experiment designed or executed;
- blocking onboarding issue;
- whether the workflow changed a real next action.

Do not treat stars, forks, impressions, or compliments as substitutes for completed workflows.

M3 is not complete until the repository is public and external users have actually attempted the workflow.
