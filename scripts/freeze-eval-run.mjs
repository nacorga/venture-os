import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateCaseFile } from './case-utils.mjs';
import {
  evaluatorSourceHashes,
  evaluatorSourcePaths,
  gitProvenance,
  runtimeProvenance,
  sha256File,
} from './eval-provenance.mjs';
import { validateVentureFile } from './venture-utils.mjs';

const [runId] = process.argv.slice(2);
if (!runId || runId.includes('/') || runId.includes('..')) {
  console.error('Usage: npm run eval:freeze -- <run-id>');
  process.exit(1);
}

const root = process.cwd();
const runDir = path.join(root, 'evals', 'runs', runId);
if (!fs.existsSync(runDir)) {
  console.error(`Eval run not found: ${runId}`);
  process.exit(1);
}

const frozenPath = path.join(runDir, 'FROZEN.json');
if (fs.existsSync(frozenPath)) {
  console.error(`Eval run is already frozen: ${runId}`);
  console.error('Do not re-freeze an immutable run. Create a new eval run instead.');
  process.exit(1);
}

for (const required of ['case.yaml', 'metadata.json', 'RESULT.md', path.join('venture', 'venture.yaml')]) {
  if (!fs.existsSync(path.join(runDir, required))) {
    console.error(`Cannot freeze incomplete run. Missing: ${required}`);
    process.exit(1);
  }
}

const metadataPath = path.join(runDir, 'metadata.json');
let metadata;
try {
  metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
} catch {
  console.error('Cannot freeze run: metadata.json is not valid JSON.');
  process.exit(1);
}

if (!metadata.case || !metadata.provenance?.framework_sha256 || !metadata.provenance?.case_sha256) {
  console.error('Cannot freeze run: metadata.json is missing creation provenance. Create a new eval run with the current harness.');
  process.exit(1);
}

const casePath = path.join(runDir, 'case.yaml');
const caseResult = validateCaseFile(casePath);
if (!caseResult.valid) {
  console.error('Cannot freeze run: case.yaml is invalid.');
  for (const error of caseResult.errors) console.error(`  - ${error}`);
  process.exit(1);
}
if (caseResult.value.id !== metadata.case) {
  console.error(`Cannot freeze run: case.yaml id ${caseResult.value.id} != metadata case ${metadata.case}.`);
  process.exit(1);
}
if (sha256File(casePath) !== metadata.provenance.case_sha256) {
  console.error('Cannot freeze run: case.yaml changed after eval creation.');
  process.exit(1);
}

const currentRuntime = runtimeProvenance(root);
if (currentRuntime.framework_sha256 !== metadata.provenance.framework_sha256) {
  console.error('Cannot freeze run: the effective Venture OS runtime changed after eval creation.');
  console.error(`Created with ${metadata.provenance.framework_sha256}`);
  console.error(`Current runtime ${currentRuntime.framework_sha256}`);
  console.error('Create a new eval run so one run maps to one effective framework version.');
  process.exit(1);
}

const currentEvaluatorHashes = evaluatorSourceHashes(root, metadata.case);
const createdEvaluatorHashes = metadata.provenance.evaluator_sources ?? {};
for (const key of ['reference_sha256', 'rubric_sha256', 'score_skill_sha256']) {
  if ((createdEvaluatorHashes[key] ?? null) !== (currentEvaluatorHashes[key] ?? null)) {
    console.error(`Cannot freeze run: evaluator source ${key} changed after eval creation.`);
    console.error('Create a new eval run so the later score uses the evaluator basis recorded at creation.');
    process.exit(1);
  }
}

const venturePath = path.join(runDir, 'venture', 'venture.yaml');
const ventureResult = validateVentureFile(venturePath);
if (!ventureResult.valid) {
  console.error('Cannot freeze run: venture.yaml is not schema-valid.');
  for (const error of ventureResult.errors) console.error(`  - ${error}`);
  process.exit(1);
}
const latestDecision = ventureResult.value.latest_decision;
if (!latestDecision?.id || !latestDecision.outcome || !latestDecision.path || !latestDecision.snapshot) {
  console.error('Cannot freeze run: no complete canonical gate decision is recorded.');
  process.exit(1);
}

const integrity = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-venture-integrity.mjs'), path.join(runDir, 'venture')], {
  cwd: root,
  encoding: 'utf8',
});
if (integrity.status !== 0) {
  console.error('Cannot freeze run: venture integrity check failed.');
  if (integrity.stdout) process.stderr.write(integrity.stdout);
  if (integrity.stderr) process.stderr.write(integrity.stderr);
  process.exit(1);
}

const frozenAt = new Date().toISOString();
const evaluatorDir = path.join(runDir, 'evaluator');
if (fs.existsSync(evaluatorDir)) {
  console.error('Cannot freeze run: evaluator/ already exists before freeze. This violates eval isolation.');
  process.exit(1);
}
fs.mkdirSync(evaluatorDir, { recursive: true });

const evaluatorSources = evaluatorSourcePaths(root, metadata.case);
if (fs.existsSync(evaluatorSources.reference)) {
  fs.copyFileSync(evaluatorSources.reference, path.join(evaluatorDir, 'reference.yaml'));
}
if (!fs.existsSync(evaluatorSources.rubric) || !fs.existsSync(evaluatorSources.score_skill)) {
  console.error('Cannot freeze run: evaluator rubric or scoring skill is missing.');
  fs.rmSync(evaluatorDir, { recursive: true, force: true });
  process.exit(1);
}
fs.copyFileSync(evaluatorSources.rubric, path.join(evaluatorDir, 'rubric.md'));
fs.copyFileSync(evaluatorSources.score_skill, path.join(evaluatorDir, 'score-skill.md'));

const freezeGit = gitProvenance(root);
const evaluatorProvenance = {
  case: metadata.case,
  created_at: metadata.created_at ?? null,
  frozen_at: frozenAt,
  model_label: metadata.model_label ?? null,
  creation_git: metadata.provenance.git ?? null,
  freeze_git: freezeGit,
  framework_sha256: currentRuntime.framework_sha256,
  evaluator_sources: currentEvaluatorHashes,
  note: 'Evaluator content was copied into this directory only after run execution and semantic validation completed.',
};
fs.writeFileSync(path.join(evaluatorDir, 'PROVENANCE.json'), JSON.stringify(evaluatorProvenance, null, 2) + '\n');

metadata.status = 'FROZEN';
metadata.frozen_at = frozenAt;
metadata.freeze_provenance = {
  git: freezeGit,
  framework_sha256: currentRuntime.framework_sha256,
  evaluator_sources: currentEvaluatorHashes,
};
fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');

const excluded = new Set(['FROZEN.json', 'SCORE.md']);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      const relative = path.relative(runDir, full).replaceAll(path.sep, '/');
      if (!excluded.has(relative)) files.push(relative);
    }
  }
}
walk(runDir);
files.sort();

const hash = crypto.createHash('sha256');
for (const relative of files) {
  hash.update(relative);
  hash.update('\0');
  hash.update(fs.readFileSync(path.join(runDir, relative)));
  hash.update('\0');
}

const marker = {
  run_id: runId,
  frozen_at: frozenAt,
  sha256: hash.digest('hex'),
  files,
  framework_sha256: currentRuntime.framework_sha256,
  evaluator_sources: currentEvaluatorHashes,
  rule: 'Run artifacts, frozen evaluator inputs and RESULT.md must not change after this marker is created. SCORE.md remains outside the frozen digest.'
};

fs.writeFileSync(frozenPath, JSON.stringify(marker, null, 2) + '\n');
console.log(`Frozen eval run ${runId}`);
console.log(`sha256: ${marker.sha256}`);
console.log(`framework sha256: ${marker.framework_sha256}`);
