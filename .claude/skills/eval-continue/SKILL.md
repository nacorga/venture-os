---
name: eval-continue
description: Continue a forked Venture OS eval run after its evidence reveal — absorb the revealed packet and make the next gate decision. Use manually in a fresh Claude Code session after npm run eval:fork.
argument-hint: <run-id>
disable-model-invocation: true
---

# Eval Continue

Run ID: `$ARGUMENTS`

If no run ID was provided, stop and show:

```text
/eval-continue <run-id>
```

Set `<run-dir>` to `evals/runs/$ARGUMENTS`. It is a fork: `<run-dir>/metadata.json` has a `parent`, and `<run-dir>/reveal/packet.yaml` holds evidence the first phase never saw. If either is missing, stop: this skill continues forks only.

## Isolation rule

Everything in `eval-run` § Isolation rule applies. In addition, never open another fork of the same parent — any `evals/runs/<parent-run-id>--*` other than this one — nor the parent run's directory. This run's own `venture/` and `RESULT.phase1.md` are its complete history.

## How to read the packet

The packet describes what happened after the first decision. **Treat its statements as true for this run**: it is a controlled scenario, so do not try to verify it on the web and do not dismiss it as hypothetical. Its *weight* is yours to judge, exactly as for any other evidence under `framework/evidence-standard.md`: what class of evidence each item is, which segment it speaks for, whether a figure in it is derived and how, and whether two items rest on the same source. A packet item can be true and still be weak evidence for an assumption.

## Workflow

1. Read `<run-dir>/case.yaml`, `<run-dir>/reveal/packet.yaml`, the venture state in `<run-dir>/venture/`, its latest decision file, and `<run-dir>/RESULT.phase1.md`.
2. Record the packet as evidence in `venture.yaml`: one or more new `E###` records per item, each with `source: "reveal/packet.yaml#PK-n"` naming the item exactly, type, strength, segment and direction per the evidence standard, linked reciprocally to the assumptions it bears on. **Every item must be cited by at least one record** — an item you judge irrelevant still gets a record, with direction `neutral` and the reason in its statement. Freeze refuses an uncited item.
3. When the packet's `kind` is `prereg`, it reports the results of the experiment it names:
   - record them in that experiment: each item's text as an entry in `results.observations`, the new evidence IDs in `results.evidence_ids`, `results.completed_at`, and `status: completed`;
   - apply `venture-learn` to the venture. It classifies `results.branch` against the locked signals and replaces `next_action`;
   - run `npm run evidence:check -- <run-dir>/venture` only after `venture-learn` has replaced `next_action` — until then the checker correctly refuses a current action that executes a completed experiment.
4. When the packet's `kind` is `planted`, it is new evidence rather than the result of an experiment this venture ran. Update assumption statuses from it as research would, and record in a learning note what it changed. Leave any existing experiment as it is.
5. Apply `venture-decide`. The decision gets a new stable decision ID; never edit or replace an earlier decision file.
6. If the new decision's `next_action` is an experiment, apply `venture-experiment` for it and run `npm run experiment:lock -- <path-to-experiment.yaml>`, leaving it `designed` — as in `eval-run`.
7. Write `<run-dir>/RESULT.md` as a projection of the new decision, in the shape `eval-run` step 8 and 9 define, plus a section **What the reveal changed**: which assumptions moved, which evidence moved them, and why the outcome is or is not the one the first phase would have predicted.
8. Run `npm run evidence:check -- <run-dir>/venture`.
9. Never modify `RESULT.phase1.md`, `reveal/packet.yaml`, a decision file that existed before this session, or an experiment's `preregistration`. Freeze checks all four against the fork.

Do not score the run and do not read evaluator references.

## Completion criteria

The venture directory is internally consistent, a new decision exists, `RESULT.md` matches its immutable snapshot, every packet item is cited, and the consistency checker passes.

Finish by telling the user only the next canonical command:

```text
/eval-freeze $ARGUMENTS
```

Do not reproduce the freeze procedure in prose; `eval-freeze` owns it.
