import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import { sha256File, verifyFrozenRun } from './eval-provenance.mjs';
import { listExperimentFiles } from './experiment-utils.mjs';
import { parseYamlFile, repoRoot } from './venture-utils.mjs';

export const revealPairSchemaPath = path.join(repoRoot, 'evals', 'schemas', 'reveal-pair.schema.json');
export const gateRank = { PARK: 0, TEST: 1, PROCEED: 2 };

// Packet text is copied into learning notes and results by the run. A venture ID
// token in it would either fail the prose ID scan or smuggle in a reference to
// state the run never created, so packets may not contain one.
const ventureIdToken = /\b(?:DNB\d{3,}|[AENTX]\d{3,})\b/;

let pairValidator;
function getPairValidator() {
  if (!pairValidator) {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    pairValidator = ajv.compile(JSON.parse(fs.readFileSync(revealPairSchemaPath, 'utf8')));
  }
  return pairValidator;
}

export function parseArm(arm) {
  if (arm === 'prereg-failure' || arm === 'prereg-success') {
    return { kind: 'prereg', branch: arm.slice('prereg-'.length) };
  }
  const planted = /^(P[0-9]{3,})-([ab])$/.exec(arm ?? '');
  if (planted) return { kind: 'planted', pairId: planted[1], side: planted[2] };
  return null;
}

export function revealPairPath(referenceDir, caseName, pairId) {
  return path.join(referenceDir, 'reveal', caseName, `${pairId}.yaml`);
}

export function validateRevealPairFile(filePath, caseName) {
  const parsed = parseYamlFile(filePath, 'reveal pair');
  if (!parsed.valid) return parsed;
  const validate = getPairValidator();
  const errors = validate(parsed.value)
    ? []
    : (validate.errors ?? []).map((error) => `${error.instancePath || '/'}: ${error.message}`);
  const pair = parsed.value;
  if (!errors.length) {
    if (caseName && pair.case !== caseName) errors.push(`/case: '${pair.case}' is not '${caseName}'`);
    if (path.basename(filePath, '.yaml') !== pair.id) errors.push(`/id: '${pair.id}' must match the file name`);
    for (const [side, arm] of Object.entries(pair.arms)) {
      const ids = arm.items.map((item) => item.id);
      if (new Set(ids).size !== ids.length) errors.push(`/arms/${side}: duplicate item ids`);
      for (const text of [arm.summary, ...arm.items.map((item) => item.text)]) {
        if (ventureIdToken.test(text)) errors.push(`/arms/${side}: contains a venture ID token (${text.match(ventureIdToken)[0]})`);
      }
    }
    const hasB = Boolean(pair.arms.b);
    if (pair.expect.order && !hasB) errors.push('/expect/order: an order needs both arms');
    if (pair.expect.b && !hasB) errors.push('/expect/b: arm b does not exist');
    for (const trap of pair.expect.traps ?? []) {
      if (trap.max_strength === undefined && trap.requires_derivation === undefined) {
        errors.push(`/expect/traps: ${trap.item} checks nothing; give it max_strength or requires_derivation`);
      }
      const sides = trap.arm === 'both' ? ['a', 'b'] : [trap.arm];
      for (const side of sides) {
        if (!pair.arms[side]) errors.push(`/expect/traps: arm ${side} does not exist`);
        else if (!pair.arms[side].items.some((item) => item.id === trap.item)) {
          errors.push(`/expect/traps: ${trap.item} is not an item of arm ${side}`);
        }
      }
    }
  }
  return { valid: errors.length === 0, value: pair, errors };
}

// What the run is shown for a planted arm: that arm's summary and items, and
// nothing of the other arm, the pair's name or the expectations.
export function plantedPacket(pair, side) {
  return {
    kind: 'planted',
    summary: pair.arms[side].summary,
    items: structuredClone(pair.arms[side].items),
  };
}

function quoteList(values) {
  return values.map((value) => `"${value}"`).join('; ');
}

// A deterministic packet built from the run's own locked design: the branch's
// signals are met, the other branches' are not, and one fixed distraction
// pulls the other way. No model writes it, so two runs of the same design see
// the same world.
export function preregPacket(experiment, branch) {
  const design = experiment.preregistration.design;
  const other = branch === 'failure' ? 'success' : 'failure';
  const sampleGoal = design.target?.sample_goal;
  const met = branch === 'failure' ? [design.signals.failure[0]] : design.signals.success;
  const distraction = branch === 'failure'
    ? 'Several participants expressed enthusiasm for the idea during the sessions and asked to be kept informed. None of them made a commitment of any kind.'
    : 'Two participants raised objections to the price during the sessions. Both still completed the committed behavior.';
  return {
    kind: 'prereg',
    experiment_id: experiment.id,
    summary: `The preregistered experiment ${experiment.id} was executed as designed. Its results are below.`,
    items: [
      {
        id: 'PK-1',
        text: sampleGoal
          ? `The procedure was followed as preregistered and the sample goal of ${sampleGoal} was reached.`
          : 'The procedure was followed as preregistered and completed in full.',
      },
      { id: 'PK-2', text: `Observed: ${met.length > 1 ? 'every one of these preregistered signals was met' : 'this preregistered signal was met'} — ${quoteList(met)}.` },
      { id: 'PK-3', text: `Not observed: none of the preregistered ${other} signals was met — ${quoteList(design.signals[other])}. None of the preregistered ambiguous conditions applies.` },
      { id: 'PK-4', text: 'There was no protocol deviation, and the time and cost caps were respected.' },
      { id: 'PK-5', text: distraction },
    ],
  };
}

export function packetItemIds(packet) {
  return (packet.items ?? []).map((item) => item.id);
}

export function citedPacketItems(evidenceIndex) {
  const cited = new Set();
  for (const record of evidenceIndex ?? []) {
    for (const [, id] of String(record.source ?? '').matchAll(/reveal\/packet\.yaml#(PK-[0-9]+)\b/g)) cited.add(id);
  }
  return cited;
}

export function evidenceCiting(evidenceIndex, itemId) {
  const pattern = new RegExp(`reveal/packet\\.yaml#${itemId}\\b`);
  return (evidenceIndex ?? []).filter((record) => pattern.test(String(record.source ?? '')));
}


// Which arm a fork was shown lives in a sealed key beside the runs, never in
// the fork: the run under test reads its own metadata.json, and a label saying
// "prereg-failure" would answer the question the fork asks. Like
// evals/reference/, the key directory is closed to runs by rule.
export function forkKeyPath(runsDir, runId) {
  return path.join(runsDir, '.keys', `${runId}.json`);
}

export function readForkKey(runsDir, runId) {
  const keyPath = forkKeyPath(runsDir, runId);
  if (!fs.existsSync(keyPath)) return null;
  return JSON.parse(fs.readFileSync(keyPath, 'utf8'));
}

export function looksForked(runDir) {
  return fs.existsSync(path.join(runDir, 'RESULT.phase1.md')) || fs.existsSync(path.join(runDir, 'reveal'));
}

function listFiles(dir, relative = '') {
  const found = [];
  for (const entry of fs.readdirSync(path.join(dir, relative), { withFileTypes: true })) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(dir, child));
    else found.push(child);
  }
  return found;
}

// Fields a later phase may legitimately change on an earlier evidence record:
// new links, and the pointer to a correction. Everything else is history.
const evidenceFieldsAFollowingPhaseMayChange = ['assumption_ids', 'superseded_by'];

function withoutFields(record, fields) {
  const copy = { ...record };
  for (const field of fields) delete copy[field];
  return copy;
}

// What a fork must still hold when it is frozen, checked against the frozen
// parent itself rather than against anything the fork could edit: phase 1
// untouched, the packet exactly what the key says was revealed, a decision made
// after it, and every packet item accounted for in evidence. Whether that
// decision was right is the verdict's business, not freeze's.
export function forkIntegrityErrors({ runsDir, runDir, key, venture, referenceDir }) {
  const errors = [];
  const parentDir = path.join(runsDir, key.parent.run_id);
  if (!fs.existsSync(parentDir)) {
    return [`its parent ${key.parent.run_id} is not under evals/runs/; freeze a fork before moving its parent`];
  }
  const parent = verifyFrozenRun(parentDir);
  if (!parent.ok || parent.marker.sha256 !== key.parent.frozen_sha256) {
    return [`its parent ${key.parent.run_id} is not the verified frozen run it was forked from`];
  }

  if (venture.latest_decision?.id === key.parent.decision_id) {
    errors.push(`no decision was made after the reveal; latest_decision is still ${key.parent.decision_id}`);
  }

  const phase1Result = path.join(runDir, 'RESULT.phase1.md');
  if (!fs.existsSync(phase1Result) || sha256File(phase1Result) !== sha256File(path.join(parentDir, 'RESULT.md'))) {
    errors.push('RESULT.phase1.md is not the parent\'s RESULT.md');
  }

  // Every phase-1 file other than the state and the experiment definitions,
  // which a second phase updates in place, must be byte for byte the parent's.
  const parentVenture = path.join(parentDir, 'venture');
  const experimentFile = /(^|\/)experiments\/.+\/experiment\.yaml$/;
  for (const relative of listFiles(parentVenture)) {
    if (relative === 'venture.yaml' || experimentFile.test(relative)) continue;
    const childFile = path.join(runDir, 'venture', relative);
    if (!fs.existsSync(childFile)) errors.push(`phase-1 file venture/${relative} is missing`);
    else if (sha256File(childFile) !== sha256File(path.join(parentVenture, relative))) errors.push(`phase-1 file venture/${relative} changed after the fork`);
  }

  // Experiments may gain results and change status; what they preregistered may not change.
  for (const parentFile of listExperimentFiles(parentVenture)) {
    const relative = path.relative(parentVenture, parentFile);
    const before = parseYamlFile(parentFile, 'experiment').value;
    const childFile = path.join(runDir, 'venture', relative);
    const after = fs.existsSync(childFile) ? parseYamlFile(childFile, 'experiment').value : null;
    if (!after || after.id !== before.id || after.primary_assumption_id !== before.primary_assumption_id) {
      errors.push(`phase-1 experiment venture/${relative} is missing or no longer the same experiment`);
    } else if (!isDeepStrictEqual(after.preregistration, before.preregistration)) {
      errors.push(`the preregistration of ${before.id} changed after the fork`);
    }
  }

  // State is append-only: earlier evidence keeps its content, earlier
  // assumptions keep what they assert.
  const parentState = parseYamlFile(path.join(parentVenture, 'venture.yaml'), 'venture.yaml').value;
  const evidence = new Map((venture.evidence_index ?? []).map((record) => [record.id, record]));
  for (const record of parentState.evidence_index ?? []) {
    const current = evidence.get(record.id);
    if (!current) errors.push(`phase-1 evidence ${record.id} was removed`);
    else if (!isDeepStrictEqual(withoutFields(current, evidenceFieldsAFollowingPhaseMayChange), withoutFields(record, evidenceFieldsAFollowingPhaseMayChange))) {
      errors.push(`phase-1 evidence ${record.id} was rewritten; supersede it with a new record instead`);
    }
  }
  const assumptions = new Map((venture.assumptions ?? []).map((item) => [item.id, item]));
  for (const item of parentState.assumptions ?? []) {
    const current = assumptions.get(item.id);
    if (!current) errors.push(`phase-1 assumption ${item.id} was removed`);
    else if (current.statement !== item.statement || current.category !== item.category) {
      errors.push(`phase-1 assumption ${item.id} now asserts something else`);
    }
  }

  // The packet must be exactly what the key says was revealed, rebuilt from
  // its source rather than trusted from a hash the fork could edit.
  const packetPath = path.join(runDir, 'reveal', 'packet.yaml');
  let expectedPacket = null;
  if (key.reveal.kind === 'prereg') {
    const experiment = parseYamlFile(path.join(parentDir, key.reveal.experiment_path), 'experiment').value;
    expectedPacket = preregPacket(experiment, key.reveal.branch);
  } else {
    const pairFile = revealPairPath(referenceDir, key.case, key.reveal.pair_id);
    if (!fs.existsSync(pairFile) || sha256File(pairFile) !== key.reveal.pair_sha256) {
      errors.push(`reveal pair ${key.reveal.pair_id} changed after the fork; a pair edited after use takes a new pair ID`);
    } else {
      expectedPacket = plantedPacket(parseYamlFile(pairFile, 'reveal pair').value, key.reveal.side);
    }
  }
  const packet = fs.existsSync(packetPath) ? parseYamlFile(packetPath, 'packet').value : null;
  if (!packet || sha256File(packetPath) !== key.reveal.packet_sha256 || (expectedPacket && !isDeepStrictEqual(packet, expectedPacket))) {
    errors.push('reveal/packet.yaml is not the packet this fork was shown');
  } else {
    const cited = citedPacketItems(venture.evidence_index);
    for (const id of packetItemIds(packet)) {
      if (!cited.has(id)) errors.push(`packet item ${id} is cited by no evidence record (source: reveal/packet.yaml#${id})`);
    }
  }
  return errors;
}
