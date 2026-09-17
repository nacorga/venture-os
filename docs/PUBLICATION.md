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

Private benchmarks should remain in a separate repository or storage boundary and run against a pinned public Venture OS commit. They are holdouts and should not be visible to the agent during public benchmark development.

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

Repository changes, including version changes, must reach `main` through a pull request. Update `package.json` and `package-lock.json` together with `npm version patch --no-git-tag-version` (replace `patch` with `minor` or `major` when appropriate), and merge only after the required validation succeeds.

Once the version commit is on `main`:

1. open **Actions → Release** in GitHub;
2. select **Run workflow** and keep the branch set to `main`;
3. run the workflow and follow its linked release when it completes.

The workflow reads the version from `package.json`; it does not ask for a second version value. It verifies that the lockfile agrees, rejects an existing tag or release, repeats the complete public validation gate, and publishes `v<version>` from the exact commit it validated. GitHub generates the release notes from merged pull requests.

The workflow uses the repository-scoped `GITHUB_TOKEN`. It does not require an npm token, personal access token, local GitHub CLI login, or direct pushes to `main`.
