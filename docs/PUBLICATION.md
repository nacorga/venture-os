# Public repository boundary and release policy

Venture OS is public and intended to remain safe to use without access to the author's private ventures or private benchmark history.

The first public release (`v0.1.0`) was created from a sanitized root history. The earlier private development history is not part of the public repository.

## What may live in the public repository

- framework and methodology;
- generic agents and skills;
- schemas and templates;
- deterministic scripts;
- synthetic examples and public Case Library inputs;
- evaluator references for the maintainer-owned public regression subset;
- generated public eval runs when intentionally retained;
- documentation that applies to any user.

## What must stay outside

- real venture names or identifying details unless intentionally public;
- customer or prospect information;
- private research and interview material;
- proprietary outcomes or commercial metrics;
- private benchmark references derived from real projects;
- credentials, tokens, private URLs, or personal data.

Private benchmarks should remain in a separate repository or storage boundary and run against a pinned public Venture OS commit. They are holdouts and should not be visible to the agent during public benchmark development. The harness reads them from outside the tree with `--suite <path>` (see `evals/README.md` § Private benchmark boundary), so nothing private is copied into this repository to run them.

## Ongoing publication rule

A clean current tree is necessary but not sufficient when importing material from private work.

Before adding a real or anonymized-real case, benchmark, research artifact, or other material derived from private work:

1. remove direct identifiers and unnecessary sensitive detail;
2. verify that proprietary metrics, private URLs, credentials, and confidential research are absent;
3. preserve enough context for the material to remain useful without making the source re-identifiable;
4. require human review for `anonymized-real` cases;
5. keep evaluator expectations separate from public case input;
6. run the repository validation suite before merge.

Passing schema validation is not proof that material is safe to publish.

See [`CASE_PUBLISHING.md`](CASE_PUBLISHING.md) for the intended assisted anonymization/publication boundary.

## Release policy

Normal releases now happen from the public repository.

Before tagging a release:

1. `npm run repo:check` passes;
2. `npm run case:validate` passes;
3. CI is green on the public default branch;
4. README and Quickstart match the current command surface;
5. no private/sensitive material has entered the reachable public history;
6. release notes describe user-visible changes without exposing private benchmark details.

The historical sanitization step was a one-time requirement for the first public release. It should not be repeated for ordinary public development unless private material is accidentally introduced; in that case, stop and remediate the public history before continuing.

## Routine release workflow

Repository changes, including version changes, must reach `main` through a pull request. Preparation and publication are shown as separate Actions so the current state and required next step remain explicit:

1. open **Actions → Prepare release** in GitHub;
2. select **Run workflow**, keep the branch set to `main`, and choose the version increment;
3. wait for the workflow to validate the repository and open the linked version pull request;
4. follow the run summary link, review the version change, and merge the pull request after its required validation succeeds;
5. follow **Publish release**, triggered automatically by the merge, to the published GitHub release. No second manual workflow run is needed.

The choices follow Semantic Versioning:

| Choice | Example from `0.2.2` | Use when |
| --- | --- | --- |
| `patch` | `0.2.3` | fixing behavior without changing the public contract |
| `minor` | `0.3.0` | adding backwards-compatible capabilities |
| `major` | `1.0.0` | making incompatible changes to the public contract |

**Prepare release** calculates the version with npm, updates `package.json` and `package-lock.json` together, and opens `release/v<version>`. It never pushes directly to `main`. The run summary and pull-request description both state that merging is the remaining publication step.

Version pull requests change only package metadata. Their required `validate` check is started explicitly by **Prepare release**, so GitHub does not also create a duplicate pull-request run that waits for maintainer approval of `github-actions[bot]` in this public repository.

After merge, **Publish release** verifies that the version is publishable, repeats the complete public validation gate, and publishes `v<version>` from the exact merge commit it validated. GitHub generates the release notes from merged pull requests.

### One-time repository setting

GitHub Actions must be allowed to create the version pull request. A repository administrator should enable **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** once. **Prepare release** creates pull requests but does not approve or merge them; branch protection and the explicitly started `validate` check still apply.

Only collaborators with repository write access can manually run **Prepare release**. Public visitors and fork contributors cannot trigger a release in this repository.

Validation runs with read-only repository permissions and without persisted Git credentials. Separate jobs receive only the permissions needed to create the version branch and pull request or publish the final release. The workflow pins third-party action code to reviewed commit SHAs and uses the repository-scoped `GITHUB_TOKEN`; it does not require an npm token, personal access token, or local GitHub CLI login.
