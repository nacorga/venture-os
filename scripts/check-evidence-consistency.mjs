import fs from 'node:fs';
import path from 'node:path';

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
const text = fs.readFileSync(targetPath, 'utf8');
let errors = 0;

function fail(message) {
  console.error(`ERROR: ${message}`);
  errors += 1;
}

function getSection(name) {
  const match = text.match(new RegExp(`^${name}:\\s*(?:\\[\\]|null)?\\s*$`, 'm'));
  if (!match) return '';
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = rest.search(/^\S[^\n]*:\s*/m);
  return next === -1 ? rest : rest.slice(0, next);
}

function parseIdBlocks(section, pattern) {
  const lines = section.split('\n');
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const idMatch = line.match(/^\s*-\s+id:\s*["']?([A-Z]+\d{3,})["']?\s*$/);
    if (idMatch && pattern.test(idMatch[1])) {
      if (current) blocks.push(current);
      current = { id: idMatch[1], lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks.map((block) => ({ ...block, text: block.lines.join('\n') }));
}

function parseAssumptionRefBlocks(section) {
  const lines = section.split('\n');
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(/^\s*-\s+assumption_id:\s*["']?(A\d{3,})["']?\s*$/);
    if (match) {
      if (current) blocks.push(current);
      current = { assumption_id: match[1], lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks.map((block) => ({ ...block, text: block.lines.join('\n') }));
}

function scalar(section, key) {
  const match = section.match(new RegExp(`^\\s*${key}:\\s*(.*?)\\s*$`, 'm'));
  if (!match) return null;
  const raw = match[1].replace(/^['"]|['"]$/g, '').trim();
  return raw === 'null' ? null : raw;
}

function idsIn(value, regex) {
  return value.match(regex) ?? [];
}

function topLevelIds(name, regex) {
  const match = text.match(new RegExp(`^${name}:\\s*(.*?)\\s*$`, 'm'));
  if (!match) return [];
  const raw = match[1].trim();
  if (raw && raw !== '[]' && raw !== 'null') return idsIn(raw, regex);
  return idsIn(getSection(name), regex);
}

function nestedKeyBlock(section, key) {
  const lines = section.split('\n');
  const index = lines.findIndex((line) => new RegExp(`^\\s+${key}:`).test(line));
  if (index === -1) return '';
  const baseIndent = lines[index].match(/^(\s*)/)?.[1].length ?? 0;
  const out = [lines[index]];
  for (let i = index + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) {
      out.push(line);
      continue;
    }
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent <= baseIndent) break;
    out.push(line);
  }
  return out.join('\n');
}

function assertUnique(blocks, label, getId = (item) => item.id) {
  const seen = new Set();
  for (const block of blocks) {
    const id = getId(block);
    if (seen.has(id)) fail(`Duplicate ${label} ID ${id}`);
    seen.add(id);
  }
}

const version = Number(text.match(/^version:\s*(\d+)\s*$/m)?.[1] ?? 1);
const assumptionBlocks = parseIdBlocks(getSection('assumptions'), /^A\d{3,}$/);
const evidenceBlocks = parseIdBlocks(getSection('evidence_index'), /^E\d{3,}$/);
const dnbSection = getSection('do_not_build');
const revisitSection = getSection('revisit_when');
const blockingDeferralsSection = getSection('blocking_deferrals');
const dnbBlocks = parseIdBlocks(dnbSection, /^DNB\d{3,}$/);
const revisitBlocks = parseIdBlocks(revisitSection, /^T\d{3,}$/);
const blockingDeferrals = parseAssumptionRefBlocks(blockingDeferralsSection);
const assumptionIds = new Set(assumptionBlocks.map((item) => item.id));
const evidenceIds = new Set(evidenceBlocks.map((item) => item.id));
const dnbIds = new Set(dnbBlocks.map((item) => item.id));
const revisitIds = new Set(revisitBlocks.map((item) => item.id));
const blockingIds = new Set(topLevelIds('blocking_assumptions', /\bA\d{3,}\b/g));
const deferralIds = new Set(blockingDeferrals.map((item) => item.assumption_id));

assertUnique(assumptionBlocks, 'assumption');
assertUnique(evidenceBlocks, 'evidence');
assertUnique(dnbBlocks, 'do-not-build');
assertUnique(revisitBlocks, 'revisit trigger');
assertUnique(blockingDeferrals, 'blocking deferral', (item) => item.assumption_id);

for (const id of blockingIds) {
  if (!assumptionIds.has(id)) fail(`blocking_assumptions references missing assumption ${id}`);
}
for (const deferral of blockingDeferrals) {
  if (!assumptionIds.has(deferral.assumption_id)) fail(`blocking_deferrals references missing assumption ${deferral.assumption_id}`);
  if (!blockingIds.has(deferral.assumption_id)) fail(`blocking_deferrals contains ${deferral.assumption_id}, which is not in blocking_assumptions`);
  if (!scalar(deferral.text, 'reason')) fail(`blocking deferral for ${deferral.assumption_id} requires a non-empty reason`);
}

let nextAction = '';
let nextId = null;
let nextAssumption = null;
if (version >= 2) {
  if (/^\s*-\s+/m.test(dnbSection) && dnbBlocks.length === 0) fail('version 2 do_not_build entries require stable DNB### IDs');
  if (/^\s*-\s+/m.test(revisitSection) && revisitBlocks.length === 0) fail('version 2 revisit_when entries require stable T### IDs');

  nextAction = getSection('next_action');
  nextId = scalar(nextAction, 'id');
  if (!nextId || !/^N\d{3,}$/.test(nextId)) fail('version 2 next_action requires stable N### id');
  nextAssumption = scalar(nextAction, 'assumption_id');
  if (nextAssumption && !assumptionIds.has(nextAssumption)) fail(`next_action references missing assumption ${nextAssumption}`);

  const dependsOnRefs = new Set(idsIn(nestedKeyBlock(nextAction, 'depends_on'), /\bN\d{3,}\b/g));
  if (dependsOnRefs.size) {
    fail(`version 2 next_action.depends_on cannot reference ${[...dependsOnRefs].join(', ')} because canonical state does not preserve action history; keep depends_on empty until an action-history model exists`);
  }
}

const assumptionEvidence = new Map();
for (const assumption of assumptionBlocks) {
  const refs = new Set(idsIn(assumption.text, /\bE\d{3,}\b/g));
  assumptionEvidence.set(assumption.id, refs);
  for (const id of refs) if (!evidenceIds.has(id)) fail(`${assumption.id} references missing evidence ${id}`);
}

const evidenceAssumptions = new Map();
for (const evidence of evidenceBlocks) {
  const refs = new Set(idsIn(evidence.text, /\bA\d{3,}\b/g));
  evidenceAssumptions.set(evidence.id, refs);
  for (const id of refs) if (!assumptionIds.has(id)) fail(`${evidence.id} references missing assumption ${id}`);
}

for (const [assumptionId, refs] of assumptionEvidence) {
  for (const evidenceId of refs) {
    if (evidenceIds.has(evidenceId) && !evidenceAssumptions.get(evidenceId)?.has(assumptionId)) {
      fail(`${assumptionId} -> ${evidenceId} is not reciprocated by ${evidenceId}.assumption_ids`);
    }
  }
}
for (const [evidenceId, refs] of evidenceAssumptions) {
  for (const assumptionId of refs) {
    if (assumptionIds.has(assumptionId) && !assumptionEvidence.get(assumptionId)?.has(evidenceId)) {
      fail(`${evidenceId} -> ${assumptionId} is not reciprocated by ${assumptionId}.evidence_ids`);
    }
  }
}

if (version >= 2) {
  for (const evidence of evidenceBlocks) {
    const evidenceSegment = scalar(evidence.text, 'segment');
    const transportJustification = scalar(evidence.text, 'transport_justification');
    for (const assumptionId of evidenceAssumptions.get(evidence.id) ?? []) {
      const assumption = assumptionBlocks.find((item) => item.id === assumptionId);
      const assumptionSegment = assumption ? scalar(assumption.text, 'segment') : null;
      if (!assumptionSegment) continue;
      if (!evidenceSegment) {
        fail(`${evidence.id} is linked to segment-scoped ${assumptionId} (${assumptionSegment}) but declares no evidence segment`);
        continue;
      }
      if (assumptionSegment !== evidenceSegment && !transportJustification) {
        fail(`${evidence.id} segment ${evidenceSegment} does not match ${assumptionId} segment ${assumptionSegment}; add transport_justification or unlink it`);
      }
    }
  }
}

const supersessions = new Map();
for (const evidence of evidenceBlocks) {
  const replacement = scalar(evidence.text, 'superseded_by');
  if (!replacement) continue;
  if (replacement === evidence.id) {
    fail(`${evidence.id} supersedes itself`);
    continue;
  }
  if (!evidenceIds.has(replacement)) fail(`${evidence.id} points to missing replacement ${replacement}`);
  supersessions.set(evidence.id, replacement);
}

for (const [oldId, replacementId] of supersessions) {
  for (const assumption of assumptionBlocks) {
    const refs = assumptionEvidence.get(assumption.id);
    if (refs.has(oldId) && !refs.has(replacementId)) {
      fail(`${assumption.id} still references superseded ${oldId} without replacement ${replacementId}`);
    }
  }
}

for (const [start] of supersessions) {
  const seen = new Set([start]);
  let current = start;
  while (supersessions.has(current)) {
    current = supersessions.get(current);
    if (seen.has(current)) {
      fail(`Supersession cycle detected from ${start} through ${current}`);
      break;
    }
    seen.add(current);
  }
}

for (const evidence of evidenceBlocks) {
  if (!/^\s+derivation:\s*$/m.test(evidence.text)) continue;
  const evidenceSegment = scalar(evidence.text, 'segment');
  if (!evidenceSegment) fail(`${evidence.id} is derived but has no explicit segment`);
}

const reopenRule = getSection('reopen_combination_rule');
const reopenRefs = new Set(idsIn(reopenRule, /\bT\d{3,}\b/g));
for (const id of reopenRefs) if (!revisitIds.has(id)) fail(`reopen_combination_rule references missing trigger ${id}`);

const latestDecision = getSection('latest_decision');
const decisionId = scalar(latestDecision, 'id');
const decisionOutcome = scalar(latestDecision, 'outcome');
const decisionPath = scalar(latestDecision, 'path');
if (decisionOutcome === 'PARK' && revisitIds.size === 0) fail('PARK decision requires at least one revisit_when trigger');

if (version >= 2 && decisionOutcome === 'TEST') {
  if (blockingIds.size && !nextAssumption) {
    fail('TEST with blocking_assumptions requires next_action.assumption_id or explicit deferral for every blocker');
  }
  if (nextAssumption && !blockingIds.has(nextAssumption)) {
    fail(`TEST next_action targets ${nextAssumption}, but it is not listed in blocking_assumptions`);
  }
  for (const blocker of blockingIds) {
    if (blocker !== nextAssumption && !deferralIds.has(blocker)) {
      fail(`blocking assumption ${blocker} has no current next action and no blocking_deferrals resolution path`);
    }
  }
}

function parseProjection(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/<!-- venture-state-projection:start -->([\s\S]*?)<!-- venture-state-projection:end -->/);
  if (!match) return null;
  const block = match[1];
  return {
    decision_id: scalar(block, 'decision_id'),
    next_action_id: scalar(block, 'next_action_id'),
    do_not_build_ids: idsIn(block.match(/^\s*do_not_build_ids:\s*(.*)$/m)?.[1] ?? '', /\bDNB\d{3,}\b/g),
    revisit_when_ids: idsIn(block.match(/^\s*revisit_when_ids:\s*(.*)$/m)?.[1] ?? '', /\bT\d{3,}\b/g),
    reopen_rule_refs: idsIn(block.match(/^\s*reopen_rule_refs:\s*(.*)$/m)?.[1] ?? '', /\bT\d{3,}\b/g)
  };
}

function sorted(values) {
  return [...values].sort().join(',');
}

function verifyProjection(filePath, label) {
  const projection = parseProjection(filePath);
  if (!projection) {
    if (version >= 2) fail(`${label} is missing venture-state-projection block`);
    return;
  }
  if (projection.decision_id !== decisionId) fail(`${label} decision_id ${projection.decision_id} != canonical ${decisionId}`);
  if (projection.next_action_id !== nextId) fail(`${label} next_action_id ${projection.next_action_id} != canonical ${nextId}`);
  if (sorted(projection.do_not_build_ids) !== sorted(dnbIds)) fail(`${label} do_not_build_ids differ from venture.yaml`);
  if (sorted(projection.revisit_when_ids) !== sorted(revisitIds)) fail(`${label} revisit_when_ids differ from venture.yaml`);
  if (sorted(projection.reopen_rule_refs) !== sorted(reopenRefs)) fail(`${label} reopen_rule_refs differ from venture.yaml`);
}

if (decisionPath) {
  const filePath = path.resolve(ventureDir, decisionPath);
  if (!fs.existsSync(filePath)) fail(`latest_decision.path does not exist: ${decisionPath}`);
  else verifyProjection(filePath, decisionPath);
}

const resultPath = path.join(path.dirname(ventureDir), 'RESULT.md');
if (fs.existsSync(resultPath)) verifyProjection(resultPath, path.relative(root, resultPath));

const knownIds = new Set([...assumptionIds, ...evidenceIds, ...dnbIds, ...revisitIds]);
const artifactPaths = [];
for (const dirName of ['research', 'decisions']) {
  const dir = path.join(ventureDir, dirName);
  if (!fs.existsSync(dir)) continue;
  for (const entry of fs.readdirSync(dir)) if (entry.endsWith('.md')) artifactPaths.push(path.join(dir, entry));
}
if (fs.existsSync(resultPath)) artifactPaths.push(resultPath);

for (const filePath of artifactPaths) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const id of new Set(idsIn(content, /\b(?:DNB\d{3,}|[AET]\d{3,})\b/g))) {
    if (!knownIds.has(id)) fail(`${path.relative(root, filePath)} references unknown ID ${id}`);
  }
  const positional = content.match(/\bdo[_ -]?not[_ -]?build\s+item\s+\d+\b|\btrigger\s+\d+\b/gi) ?? [];
  for (const ref of positional) fail(`${path.relative(root, filePath)} uses fragile positional reference: "${ref}"`);
}

if (errors) {
  console.error(`\n${errors} venture consistency issue(s) found.`);
  process.exit(1);
}

console.log(`Venture consistency OK: ${path.relative(root, targetPath)}`);
console.log(`Verified ${assumptionBlocks.length} assumption(s), ${evidenceBlocks.length} evidence record(s), ${dnbBlocks.length} do-not-build item(s), ${revisitBlocks.length} revisit trigger(s), ${blockingDeferrals.length} blocking deferral(s).`);
if (supersessions.size) console.log(`Verified ${supersessions.size} supersession link(s).`);
