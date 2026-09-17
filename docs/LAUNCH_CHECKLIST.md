# Public v0.1 launch checklist

Status: **technical launch complete**. The remaining M3 gate is external usage by people who did not build Venture OS.

This file records the public-release gate and post-launch hardening so later work does not accidentally reopen completed tasks or lose repository-governance requirements.

## Repository safety — complete

- [x] Current public tree contains only generic, publishable content.
- [x] No secrets, private URLs, customer data, or private venture artifacts are present in the public tree.
- [x] Public history is sanitized; the private development history is not exposed.
- [x] Public repository was created from a fresh sanitized root history rather than by changing visibility on the private repository.
- [x] Private benchmark suite remains stored separately.
- [x] Generated local venture workspaces are gitignored by default.

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

## Deterministic repository hardening — complete in v0.1.1+

- [x] Node.js 24 is the supported runtime and pinned through `.nvmrc`.
- [x] `package-lock.json` is committed.
- [x] CI installs with `npm ci` rather than resolving an unpinned dependency graph.
- [x] Deterministic regression tests cover Case Library validation, venture creation, decision-state integrity, experiment preregistration and eval freeze integrity.
- [x] `repo:check` protects runtime, lockfile, CI, test, and Dependabot invariants.
- [x] Dependabot checks npm and GitHub Actions weekly.

## Repository governance — verified

Verified against the active repository ruleset and merge settings on 2026-09-17:

- [x] Default branch has an active ruleset (`Protect main`).
- [x] Pull requests are required before merging to `main`.
- [x] The `validate` status check is required and the branch must be up to date.
- [x] Force pushes and branch deletion are blocked on `main`.
- [x] Linear history is required.
- [x] Squash merge is the enabled merge strategy; merged head branches are automatically deleted.
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
- [x] Public `v0.1.1` release published.
- [x] README links and hero asset resolve from the public repository.
- [x] CI run completed successfully on the public default branch after launch.
- [x] Root commit author uses the GitHub `noreply` address rather than a personal email.

## External user gate — in progress

Invite at least 10 people who did not build Venture OS to try the Quickstart **without live guidance**. Treat each person as one attempt; do not replace incomplete attempts with successful ones.

For every attempt record:

- whether the Quickstart was actually started;
- furthest stage reached;
- time to first venture state and time to first gate decision;
- dropout point and reason when incomplete;
- repeated setup/workflow blockers;
- gate outcome reached, if any;
- whether the result changed, constrained, or explicitly confirmed the user's real next action;
- whether an experiment was designed;
- whether an experiment was actually executed;
- approximate elapsed time and cash spent on the experiment;
- any decision-quality or evidence-trust concern raised by the user.

Do not treat stars, forks, impressions, comments, compliments, or raw document volume as substitutes for completed workflows.

### Predeclared interpretation rules for the first 10 attempts

These thresholds are **directional product heuristics for a small cohort, not statistical proof of product-market fit**. Apply them after the 10 attempts instead of inventing a favorable interpretation afterward.

**Continue the current methodology and iterate locally** when all of these are true:

- at least 6/10 users reach a gate decision without live guidance;
- at least 3/10 reach an executable experiment design or execute one;
- at least 4/10 record that the workflow changed, constrained, or explicitly confirmed a real next action;
- no single critical onboarding blocker prevents 4 or more users from progressing.

**Simplify the workflow/onboarding before expanding scope** when:

- fewer than 6/10 reach a decision; and
- at least 4/10 stop for the same or closely related setup/navigation/process friction; and
- among users who do reach a decision, there is still repeated evidence that the output changes or constrains a real next action.

**Rework the methodology before productizing further** when either is true:

- at least 6/10 reach a decision but fewer than 3/10 record any meaningful change or constraint to their next action; or
- 3 or more users independently surface the same material trust problem in evidence handling, decision logic, history preservation, or experiment interpretation.

If results are mixed or fall between these rules, classify the outcome as **inconclusive** and target the dominant unresolved uncertainty with the next bounded test. Do not average away qualitatively different failure modes.

### Hosted-product gate remains separate

Ten external attempts validate workflow behavior, not willingness to pay for hosted software. Do not use M3 completion alone to justify building a cloud product.

Reconsider hosted/persistent product work only when external usage produces repeated evidence such as:

- recurring CLI/setup friction that a hosted experience would directly remove;
- explicit requests for persistence, collaboration, shared history, or multi-venture management;
- repeated usage beyond a one-off evaluation;
- direct willingness-to-pay evidence for those capabilities.

## M3 completion condition

M3 is complete only when:

1. the technical launch remains healthy;
2. repository governance does not allow accidental bypass of the required validation path;
3. at least 10 external users have actually attempted the workflow without live guidance; and
4. the cohort has been interpreted using the predeclared rules above, with the resulting continue/simplify/rework/inconclusive decision recorded.

Until then, avoid speculative product expansion. Fix demonstrated onboarding or decision-system failures first.
