import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  parseDecisionProjection,
  validateVentureFile,
} from './venture-utils.mjs';

const [target] = process.argv.slice(2);
if (!target) {
  console.error('Usage: npm run evidence:check -- <venture-dir|venture.yaml>');
  process.exit(1);
}

const root = process.cwd();
let targetPath = path.resolve(root, target);
if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
  targetPath = path.join(targetPath, 'venture.yaml');
}
if (!fs.existsSync(targetPath)) {
  console.error(`venture.yaml not found: ${path.relative(root, targetPath)}`);
  process.exit(1);
}

const ventureDir = path.dirname(targetPath);
let errors = 0;

function fail(message) {
  console.error(`ERROR: ${message}`);
  errors += 1;
}

const parsed = validateVentureFile(targetPath);
if (!parsed.valid) {
  for (const error of parsed.errors) fail(error);
  console.error(`\n${errors} venture consistency issue(s) found.`);
  process.exit(1);
}
const state = parsed.value;

function mapById(items, label) {
  const map = new Map();
  for (const item of items ?? []) {
    if (map.has(item.id)) fail(`Duplicate ${label} ID ${item.id}`);
    map.set(item.id, item);
  }
  return map;
}

function unique(values) {
  return [...new Set(values ?? [])];
}

function refsFromReopenRule(rule) {
  if (!rule) return [];
  return unique([...(rule.all_of ?? []), ...(rule.any_of ?? [])]);
}

function guardrailIdsFromSnapshot(snapshot) {
  const ids = new Set();
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return ids;

  for (const item of snapshot.do_not_build ?? []) if (item.id) ids.add(item.id);
  for (const item of snapshot.revisit_when ?? []) if (item.id) ids.add(item.id);
  return ids;
}

const assumptions = mapById(state.assumptions, 'assumption');
const evidence = mapById(state.evidence_index, 'evidence');
const doNotBuild = mapById(state.do_not_build, 'do-not-build');
const revisitWhen = mapById(state.revisit_when, 'revisit trigger');
const blockingIds = new Set(state.blocking_assumptions ?? []);
const blockingDeferrals = new Map();

for (const id of blockingIds) {
  if (!assumptions.has(id)) fail(`blocking_assumptions references missing assumption ${id}`);
}

for (const deferral of state.blocking_deferrals ?? []) {
  if (blockingDeferrals.has(deferral.assumption_id)) fail(`Duplicate blocking deferral for ${deferral.assumption_id}`);
  blockingDeferrals.set(deferral.assumption_id, deferral);
  if (!assumptions.has(deferral.assumption_id)) fail(`blocking_deferrals references missing assumption ${deferral.assumption_id}`);
  if (!blockingIds.has(deferral.assumption_id)) fail(`blocking_deferrals contains ${deferral.assumption_id}, which is not in blocking_assumptions`);
}

const nextAction = state.next_action;
if (state.version >= 2) {
  if (nextAction.depends_on?.length) {
    fail(`version 2 next_action.depends_on cannot reference ${nextAction.depends_on.join(', ')} because canonical state does not preserve action history; keep depends_on empty until an action-history model exists`);
  }
  if (nextAction.assumption_id && !assumptions.has(nextAction.assumption_id)) {
    fail(`next_action references missing assumption ${nextAction.assumption_id}`);
  }
}

for (const assumption of assumptions.values()) {
  for (const evidenceId of assumption.evidence_ids ?? []) {
    if (!evidence.has(evidenceId)) {
      fail(`${assumption.id} references missing evidence ${evidenceId}`);
      continue;
    }
    if (!(evidence.get(evidenceId).assumption_ids ?? []).includes(assumption.id)) {
      fail(`${assumption.id} -> ${evidenceId} is not reciprocated by ${evidenceId}.assumption_ids`);
    }
  }
}

for (const item of evidence.values()) {
  for (const assumptionId of item.assumption_ids ?? []) {
    if (!assumptions.has(assumptionId)) {
      fail(`${item.id} references missing assumption ${assumptionId}`);
      continue;
    }
    if (!(assumptions.get(assumptionId).evidence_ids ?? []).includes(item.id)) {
      fail(`${item.id} -> ${assumptionId} is not reciprocated by ${assumptionId}.evidence_ids`);
    }

    const assumptionSegment = assumptions.get(assumptionId).segment;
    if (state.version >= 2 && assumptionSegment) {
      if (!item.segment) {
        fail(`${item.id} is linked to segment-scoped ${assumptionId} (${assumptionSegment}) but declares no evidence segment`);
      } else if (item.segment !== assumptionSegment && !item.transport_justification) {
        fail(`${item.id} segment ${item.segment} does not match ${assumptionId} segment ${assumptionSegment}; add transport_justification or unlink it`);
      }
    }
  }

  if (item.derivation && !item.segment) fail(`${item.id} is derived but has no explicit segment`);
  if (item.derivation && item.strength === 'strong' && !item.superseded_by) {
    const note = item.derivation.verification_note;
    if (item.derivation.independently_verified !== true || typeof note !== 'string' || note.trim() === '') {
      fail(`${item.id} is derived and strong without a recorded second check; cap it at medium or set derivation.independently_verified with a verification_note`);
    }
  }

  if (item.superseded_by) {
    if (item.superseded_by === item.id) fail(`${item.id} supersedes itself`);
    else if (!evidence.has(item.superseded_by)) fail(`${item.id} points to missing replacement ${item.superseded_by}`);
  }
}

for (const item of evidence.values()) {
  if (!item.superseded_by || !evidence.has(item.superseded_by)) continue;
  for (const assumption of assumptions.values()) {
    if ((assumption.evidence_ids ?? []).includes(item.id) && !(assumption.evidence_ids ?? []).includes(item.superseded_by)) {
      fail(`${assumption.id} still references superseded ${item.id} without replacement ${item.superseded_by}`);
    }
  }
}

for (const start of evidence.values()) {
  if (!start.superseded_by) continue;
  const seen = new Set([start.id]);
  let current = start;
  while (current?.superseded_by && evidence.has(current.superseded_by)) {
    const next = current.superseded_by;
    if (seen.has(next)) {
      fail(`Supersession cycle detected from ${start.id} through ${next}`);
      break;
    }
    seen.add(next);
    current = evidence.get(next);
  }
}

for (const item of doNotBuild.values()) {
  for (const evidenceId of item.evidence_ids ?? []) {
    if (!evidence.has(evidenceId)) fail(`${item.id} references missing evidence ${evidenceId}`);
  }
}

const reopenRefs = refsFromReopenRule(state.reopen_combination_rule);
for (const id of reopenRefs) if (!revisitWhen.has(id)) fail(`reopen_combination_rule references missing trigger ${id}`);

const latestDecision = state.latest_decision;
function validateDecisionSnapshotReferences(snapshot, outcome, label) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    fail(`${label}: decision snapshot is missing or invalid`);
    return;
  }

  const snapshotAction = snapshot.next_action;
  if (!snapshotAction || typeof snapshotAction !== 'object' || Array.isArray(snapshotAction)) {
    fail(`${label}: snapshot next_action is missing or invalid`);
  } else if (snapshotAction.assumption_id && !assumptions.has(snapshotAction.assumption_id)) {
    fail(`${label}: snapshot next_action references missing assumption ${snapshotAction.assumption_id}`);
  }

  const decisionBlockingIds = new Set(snapshot.blocking_assumptions ?? []);
  for (const id of decisionBlockingIds) {
    if (!assumptions.has(id)) fail(`${label}: snapshot references missing blocking assumption ${id}`);
  }

  const decisionDeferrals = new Set();
  for (const deferral of snapshot.blocking_deferrals ?? []) {
    if (decisionDeferrals.has(deferral.assumption_id)) {
      fail(`${label}: duplicate blocking deferral for ${deferral.assumption_id}`);
    }
    decisionDeferrals.add(deferral.assumption_id);
    if (!assumptions.has(deferral.assumption_id)) {
      fail(`${label}: blocking deferral references missing assumption ${deferral.assumption_id}`);
    }
    if (!decisionBlockingIds.has(deferral.assumption_id)) {
      fail(`${label}: blocking deferral ${deferral.assumption_id} is not in snapshot blocking_assumptions`);
    }
  }

  const snapshotDoNotBuild = new Set();
  for (const item of snapshot.do_not_build ?? []) {
    if (snapshotDoNotBuild.has(item.id)) fail(`${label}: duplicate do-not-build ID ${item.id}`);
    snapshotDoNotBuild.add(item.id);
    for (const evidenceId of item.evidence_ids ?? []) {
      if (!evidence.has(evidenceId)) fail(`${label}: snapshot ${item.id} references missing evidence ${evidenceId}`);
    }
  }

  const snapshotTriggerIds = new Set();
  for (const item of snapshot.revisit_when ?? []) {
    if (snapshotTriggerIds.has(item.id)) fail(`${label}: duplicate revisit trigger ID ${item.id}`);
    snapshotTriggerIds.add(item.id);
  }
  for (const id of refsFromReopenRule(snapshot.reopen_combination_rule)) {
    if (!snapshotTriggerIds.has(id)) fail(`${label}: snapshot reopen_combination_rule references missing trigger ${id}`);
  }

  if (outcome === 'PARK' && snapshotTriggerIds.size === 0) {
    fail(`${label}: PARK decision snapshot requires at least one revisit_when trigger`);
  }

  if (outcome === 'TEST') {
    if (decisionBlockingIds.size && !snapshotAction?.assumption_id) {
      fail(`${label}: TEST snapshot with blocking_assumptions requires its decision-time next_action.assumption_id`);
    }
    if (snapshotAction?.assumption_id && !decisionBlockingIds.has(snapshotAction.assumption_id)) {
      fail(`${label}: TEST snapshot targets ${snapshotAction.assumption_id}, but it is not listed in snapshot blocking_assumptions`);
    }
    for (const blocker of decisionBlockingIds) {
      if (blocker !== snapshotAction?.assumption_id && !decisionDeferrals.has(blocker)) {
        fail(`${label}: TEST snapshot blocking assumption ${blocker} has no decision-time next action and no blocking_deferrals resolution path`);
      }
    }
  }
}

function verifyDecisionSnapshot(filePath, label) {
  let source;
  try {
    source = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`${label} cannot be read: ${error.message}`);
    return;
  }

  const projection = parseDecisionProjection(source);
  if (!projection.valid) {
    for (const error of projection.errors) fail(`${label}: ${error}`);
    return;
  }

  const value = projection.value;
  if (value.decision_id !== latestDecision.id) fail(`${label} decision_id ${value.decision_id ?? 'null'} != canonical ${latestDecision.id}`);
  if (value.outcome !== latestDecision.outcome) fail(`${label} outcome ${value.outcome ?? 'null'} != canonical ${latestDecision.outcome}`);
  if (!latestDecision.snapshot) {
    fail(`${label}: canonical latest_decision.snapshot is missing`);
    return;
  }

  const projectedSnapshot = value.snapshot;
  validateDecisionSnapshotReferences(projectedSnapshot, value.outcome, label);
  if (!projectedSnapshot || typeof projectedSnapshot !== 'object' || Array.isArray(projectedSnapshot)) return;
  if (!isDeepStrictEqual(projectedSnapshot, latestDecision.snapshot)) {
    fail(`${label} decision snapshot differs from canonical latest_decision.snapshot`);
  }
}

if (latestDecision.id) {
  const filePath = path.resolve(ventureDir, latestDecision.path);
  if (!fs.existsSync(filePath)) fail(`latest_decision.path does not exist: ${latestDecision.path}`);
  else verifyDecisionSnapshot(filePath, latestDecision.path);
}

const resultPath = path.join(path.dirname(ventureDir), 'RESULT.md');
if (fs.existsSync(resultPath) && latestDecision.id) verifyDecisionSnapshot(resultPath, path.relative(root, resultPath));

const currentKnownIds = new Set([...assumptions.keys(), ...evidence.keys(), ...doNotBuild.keys(), ...revisitWhen.keys()]);
const historicalGuardrailIds = new Set();
const decisionIds = new Set();
const doNotBuildMeanings = new Map([...doNotBuild.values()].map((item) => [item.id, item.statement]));
const revisitMeanings = new Map([...revisitWhen.values()].map((item) => [item.id, item.condition]));
const artifactPaths = [];
for (const dirName of ['research', 'decisions', 'learning']) {
  const dir = path.join(ventureDir, dirName);
  if (!fs.existsSync(dir)) continue;
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.md')) continue;
    const filePath = path.join(dir, entry);
    artifactPaths.push(filePath);

    if (dirName === 'decisions') {
      const projection = parseDecisionProjection(fs.readFileSync(filePath, 'utf8'));
      if (!projection.valid) {
        for (const error of projection.errors) fail(`${path.relative(root, filePath)}: ${error}`);
      } else {
        const label = path.relative(root, filePath);
        const { decision_id: decisionId, outcome, snapshot } = projection.value;
        if (!/^D\d{3,}$/.test(decisionId ?? '')) fail(`${label}: invalid decision_id ${decisionId ?? 'null'}`);
        else if (decisionIds.has(decisionId)) fail(`${label}: duplicate decision ID ${decisionId}`);
        else decisionIds.add(decisionId);
        if (!['PROCEED', 'TEST', 'PARK'].includes(outcome)) fail(`${label}: invalid outcome ${outcome ?? 'null'}`);
        validateDecisionSnapshotReferences(snapshot, outcome, label);
        for (const id of guardrailIdsFromSnapshot(snapshot)) historicalGuardrailIds.add(id);
        for (const item of snapshot.do_not_build ?? []) {
          if (doNotBuildMeanings.has(item.id) && doNotBuildMeanings.get(item.id) !== item.statement) {
            fail(`${label}: do-not-build ID ${item.id} is reused with a different statement`);
          } else {
            doNotBuildMeanings.set(item.id, item.statement);
          }
        }
        for (const item of snapshot.revisit_when ?? []) {
          if (revisitMeanings.has(item.id) && revisitMeanings.get(item.id) !== item.condition) {
            fail(`${label}: revisit trigger ID ${item.id} is reused with a different condition`);
          } else {
            revisitMeanings.set(item.id, item.condition);
          }
        }
      }
    }
  }
}
if (fs.existsSync(resultPath)) artifactPaths.push(resultPath);

// Assumptions and evidence are append-only canonical records. Only retired
// decision guardrails may resolve exclusively through a historical snapshot.
const knownIds = new Set([...currentKnownIds, ...historicalGuardrailIds]);
for (const filePath of artifactPaths) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const id of new Set(content.match(/\b(?:DNB\d{3,}|[AET]\d{3,})\b/g) ?? [])) {
    if (!knownIds.has(id)) fail(`${path.relative(root, filePath)} references unknown ID ${id}`);
  }
  for (const ref of content.match(/\bdo[_ -]?not[_ -]?build\s+item\s+\d+\b|\btrigger\s+\d+\b/gi) ?? []) {
    fail(`${path.relative(root, filePath)} uses fragile positional reference: "${ref}"`);
  }
}

if (errors) {
  console.error(`\n${errors} venture consistency issue(s) found.`);
  process.exit(1);
}

console.log(`Venture consistency OK: ${path.relative(root, targetPath)}`);
console.log(`Verified ${assumptions.size} assumption(s), ${evidence.size} evidence record(s), ${doNotBuild.size} do-not-build item(s), ${revisitWhen.size} revisit trigger(s), ${blockingDeferrals.size} blocking deferral(s).`);
