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
if (latestDecision.outcome === 'PARK' && revisitWhen.size === 0) fail('PARK decision requires at least one revisit_when trigger');

if (state.version >= 2 && latestDecision.outcome === 'TEST') {
  if (blockingIds.size && !nextAction.assumption_id) {
    fail('TEST with blocking_assumptions requires next_action.assumption_id or explicit deferral for every blocker');
  }
  if (nextAction.assumption_id && !blockingIds.has(nextAction.assumption_id)) {
    fail(`TEST next_action targets ${nextAction.assumption_id}, but it is not listed in blocking_assumptions`);
  }
  for (const blocker of blockingIds) {
    if (blocker !== nextAction.assumption_id && !blockingDeferrals.has(blocker)) {
      fail(`blocking assumption ${blocker} has no current next action and no blocking_deferrals resolution path`);
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
  if (!projectedSnapshot || typeof projectedSnapshot !== 'object' || Array.isArray(projectedSnapshot)) {
    fail(`${label}: projection snapshot is missing or invalid`);
    return;
  }
  if (!isDeepStrictEqual(projectedSnapshot, latestDecision.snapshot)) {
    fail(`${label} decision snapshot differs from canonical latest_decision.snapshot`);
  }

  const snapshotNextAssumption = projectedSnapshot.next_action?.assumption_id;
  if (snapshotNextAssumption && !assumptions.has(snapshotNextAssumption)) {
    fail(`${label} snapshot next_action references missing assumption ${snapshotNextAssumption}`);
  }

  for (const id of projectedSnapshot.blocking_assumptions ?? []) {
    if (!assumptions.has(id)) fail(`${label} snapshot references missing blocking assumption ${id}`);
  }
  for (const item of projectedSnapshot.do_not_build ?? []) {
    for (const evidenceId of item.evidence_ids ?? []) {
      if (!evidence.has(evidenceId)) fail(`${label} snapshot ${item.id} references missing evidence ${evidenceId}`);
    }
  }
  const snapshotTriggerIds = new Set((projectedSnapshot.revisit_when ?? []).map((item) => item.id));
  for (const id of refsFromReopenRule(projectedSnapshot.reopen_combination_rule)) {
    if (!snapshotTriggerIds.has(id)) fail(`${label} snapshot reopen_combination_rule references missing trigger ${id}`);
  }
}

if (latestDecision.id) {
  const filePath = path.resolve(ventureDir, latestDecision.path);
  if (!fs.existsSync(filePath)) fail(`latest_decision.path does not exist: ${latestDecision.path}`);
  else verifyDecisionSnapshot(filePath, latestDecision.path);
}

const resultPath = path.join(path.dirname(ventureDir), 'RESULT.md');
if (fs.existsSync(resultPath) && latestDecision.id) verifyDecisionSnapshot(resultPath, path.relative(root, resultPath));

const knownIds = new Set([...assumptions.keys(), ...evidence.keys(), ...doNotBuild.keys(), ...revisitWhen.keys()]);
const artifactPaths = [];
for (const dirName of ['research', 'decisions', 'learning']) {
  const dir = path.join(ventureDir, dirName);
  if (!fs.existsSync(dir)) continue;
  for (const entry of fs.readdirSync(dir)) if (entry.endsWith('.md')) artifactPaths.push(path.join(dir, entry));
}
if (fs.existsSync(resultPath)) artifactPaths.push(resultPath);

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
