# Public repository boundary

Venture OS is intended to be safe to publish and useful without access to the author's private ventures.

## What may live in the public repository

- framework and methodology;
- generic agents and skills;
- schemas and templates;
- deterministic scripts;
- synthetic examples and eval cases;
- evaluator references for those synthetic cases;
- documentation that applies to any user.

## What must stay outside

- real venture names or identifying details;
- customer or prospect information;
- private research and interview material;
- proprietary outcomes or commercial metrics;
- private benchmark references derived from real projects;
- credentials, tokens, private URLs, or personal data.

Private benchmarks should be stored separately and executed against a pinned Venture OS commit. They act as a holdout suite and should not be visible to the agent during public benchmark development.

## Publication gate

**Do not change repository visibility to public solely because the current tree is clean.**

This repository had a private development phase. Deleted files and old examples remain accessible through Git history after a visibility change. Before the first public release, publish from a sanitized history (for example, a fresh repository or a deliberately rewritten root history) and verify that no private development artifacts remain in reachable commits.

Minimum pre-public checks:

1. current tree contains only generic, publishable content;
2. no secrets or private URLs exist in the current tree;
3. historical commits have been sanitized or excluded from the public history;
4. synthetic evals pass after genericization;
5. README, license, and contribution surface describe a project usable by someone with no private context.

The visibility switch belongs to a later release gate, not to ordinary feature work.
