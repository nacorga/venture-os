import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { sha256File } from './eval-provenance.mjs';
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
// nothing of the other arm or of the expectations.
export function plantedPacket(pair, side) {
  return {
    kind: 'planted',
    arm: `${pair.id}-${side}`,
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
    arm: `prereg-${branch}`,
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

export function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

// What a fork must still hold when it is frozen: phase 1 untouched, the packet
// as it was revealed, a decision made after it, and every packet item accounted
// for in evidence. These are integrity conditions; whether the decision was
// right is the verdict's business, not freeze's.
export function forkIntegrityErrors(runDir, metadata, venture) {
  const errors = [];
  const { parent, reveal } = metadata;

  if (venture.latest_decision?.id === parent.decision_id) {
    errors.push(`no decision was made after the reveal; latest_decision is still ${parent.decision_id}`);
  }
  for (const [relative, sha256] of Object.entries(parent.decision_files ?? {})) {
    const filePath = path.join(runDir, relative);
    if (!fs.existsSync(filePath)) errors.push(`phase-1 decision ${relative} is missing`);
    else if (sha256File(filePath) !== sha256) errors.push(`phase-1 decision ${relative} changed after the fork`);
  }
  const phase1Result = path.join(runDir, 'RESULT.phase1.md');
  if (!fs.existsSync(phase1Result) || sha256File(phase1Result) !== parent.result_sha256) {
    errors.push('RESULT.phase1.md changed after the fork');
  }

  const packetPath = path.join(runDir, 'reveal', 'packet.yaml');
  if (!fs.existsSync(packetPath) || sha256File(packetPath) !== reveal.packet_sha256) {
    errors.push('reveal/packet.yaml changed after the fork');
  } else {
    const packet = parseYamlFile(packetPath, 'packet').value ?? {};
    const cited = citedPacketItems(venture.evidence_index);
    for (const id of packetItemIds(packet)) {
      if (!cited.has(id)) errors.push(`packet item ${id} is cited by no evidence record (source: reveal/packet.yaml#${id})`);
    }
  }

  if (parent.preregistration) {
    const experimentPath = path.join(runDir, parent.preregistration.path);
    const experiment = fs.existsSync(experimentPath) ? parseYamlFile(experimentPath, 'experiment').value : null;
    if (!experiment || sha256Json(experiment.preregistration) !== parent.preregistration.sha256) {
      errors.push(`the preregistration of ${parent.preregistration.experiment_id} changed after the fork`);
    }
  }
  return errors;
}
