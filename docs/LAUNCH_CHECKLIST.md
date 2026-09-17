# Public v0.1 launch checklist

Status: **technical launch complete**. The remaining M3 gate is external usage by people who did not build Venture OS.

This file records the public-release gate and post-launch hardening so later work does not accidentally reopen completed tasks or lose repository-governance requirements.

## Repository safety — complete

- [x] Current public tree contains only generic, publishable content.
- [x] No secrets, private URLs, customer data, or private venture artifacts are present in the public tree.
- [x] Public history is sanitized; the private development history is not exposed.
- [x] Public repository was created from a fresh sanitized root history rather than by changing visibility on the private repository.
- [x] Private benchmark suite remains stored separately.
- [x] Generated `ventures/*` workspaces are ignored by Git by default; only `ventures/.gitkeep` is public.

See `docs/PUBLICATION.md` for the ongoing repository boundary.

## Clean-checkout onboarding — complete

Current clean-checkout validation uses the committed lockfile:

```bash
npm ci
npm test
npm run repo:check
npm run case:validate
npm run venture:new -- onboarding-smoke "A B2B SaaS that helps small teams detect costly workflow anomalies before they become incidents"
npm run venture:check -- onboarding-smoke
```

- [x] `docs/QUICKSTART.md` is usable from a clean clone.
- [x] No undocumented private setup is required for the public workflow.
- [x] Claude Code project skills are the public workflow surface.
- [x] CI is green on the public default branch.

## Deterministic repository hardening

- [x] Node.js 24 is the supported runtime and pinned through `.nvmrc`.
- [x] `package-lock.json` is committed.
- [x] CI installs with `npm ci` rather than resolving an unpinned dependency graph.
- [x] Deterministic regression tests cover Case Library validation, venture creation, and eval freeze integrity.
- [x] `repo:check` protects runtime, lockfile, CI, test, and Dependabot invariants.
- [x] Dependabot checks npm and GitHub Actions weekly.
- [x] Venture state is parsed as YAML and validated against schemas before semantic cross-reference checks.
- [x] Historical decisions preserve an immutable decision-time snapshot while current operational state can advance.
- [x] Experiments can be preregistered with an executable design lock before execution.
- [x] Eval runs record framework/case/rubric/reference provenance and refuse scoring against silently changed evaluator criteria.

## Repository governance — verified

- [x] Protect the default branch with an active ruleset.
- [x] Require pull requests before merging to `main`.
- [x] Require the `validate` status check and require the branch to be up to date.
- [x] Block force pushes and branch deletion on `main`.
- [x] Require linear history.
- [x] Use squash merge as the normal merge strategy and automatically delete merged head branches.
- [ ] Configure the repository social preview image.
- [ ] Review GitHub code-security settings: dependency graph, Dependabot alerts/security updates, secret scanning, and push protection where available.

## Community surface — complete

- [x] Issues enabled.
- [x] Bug report form available.
- [x] Case contribution form available.
- [x] Workflow feedback form available.
- [x] Discussions enabled.
- [x] `CONTRIBUTING.md` linked from README.
- [x] Privacy-first feedback policy linked from README.

## Release

- [x] Repository published from sanitized history.
- [x] Public `v0.1.0` release created.
- [x] Public `v0.1.1` hardening release created.
- [x] README links and hero asset resolve from the public repository.
- [x] CI run completed successfully on the public default branch after launch.
- [x] Root commit author uses the GitHub `noreply` address rather than a personal email.
- [ ] Publish the next patch release after the state/experiment/eval integrity PR stack is merged and `main` CI is green.

## External user gate — pre-registered, not yet complete

Invite at least 10 people who did not build Venture OS to try the Quickstart **without live guidance**.

The protocol, observations, thresholds, and interpretation rules are pre-registered in `docs/M3_VALIDATION_EXPERIMENT.md`. Do not change those rules after seeing cohort outcomes; create a new experiment if the protocol itself is flawed.

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

1. the technical launch remains healthy;
2. repository governance does not allow accidental bypass of the required validation path;
3. at least 10 external users have actually attempted the workflow without live guidance; and
4. the cohort is interpreted against the pre-registered rules in `docs/M3_VALIDATION_EXPERIMENT.md`, ending in an explicit PROCEED / TEST / PARK decision.

Until then, avoid speculative product expansion. Fix demonstrated onboarding or decision-system failures first.
