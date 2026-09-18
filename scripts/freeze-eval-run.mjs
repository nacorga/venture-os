import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { validateCaseFile } from './case-utils.mjs';
import { resolveSuite } from './eval-suite.mjs';
import {
  evaluatorBundle,
  evaluatorSourceHashes,
  evaluatorSourcePaths,
  gitProvenance,
  runDigest,
  runtimeProvenance,
  sha256File,
} from './eval-provenance.mjs';
import { findLockedExperimentsFor, structuredRoutingErrors } from './experiment-utils.mjs';
import { validateVentureFile } from './venture-utils.mjs';

let args;
try {
  args = parseArgs({ allowPositionals: true, options: { suite: { type: 'string' } } });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const [runId] = args.positionals;
if (!runId || runId.includes('/') || runId.includes('..')) {
  console.error('Usage: npm run eval:freeze -- <run-id> [--suite <path>]');
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

const suiteLabel = metadata.suite?.label ?? null;
if (suiteLabel && !args.values.suite) {
  console.error(`Cannot freeze run: it was created from suite ${suiteLabel}; pass --suite <path to that suite>.`);
  process.exit(1);
}
if (!suiteLabel && args.values.suite) {
  console.error('Cannot freeze run: it was created from this repository, not from a suite; drop --suite.');
  process.exit(1);
}
let suite;
try {
  suite = resolveSuite(root, args.values.suite);
} catch (error) {
  console.error(`Cannot freeze run: ${error.message}`);
  process.exit(1);
}
if (suite.label !== suiteLabel) {
  console.error(`Cannot freeze run: created from suite ${suiteLabel}, but --suite points at ${suite.label}.`);
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

const currentEvaluatorHashes = evaluatorSourceHashes(root, metadata.case, suite.referenceDir);
const createdEvaluatorHashes = metadata.provenance.evaluator_sources ?? {};
for (const key of Object.keys(evaluatorBundle)) {
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

// A decision whose next action is an experiment is only checkable later if that
// experiment was designed and locked, with outcomes the results can be routed by.
const decidedAction = latestDecision.snapshot.next_action;
if (decidedAction?.type === 'experiment') {
  const locked = findLockedExperimentsFor(path.join(runDir, 'venture'), decidedAction.assumption_id)
    .filter(({ experiment }) => structuredRoutingErrors({ id: experiment.id, ...experiment.preregistration.design }).length === 0);
  if (!locked.length) {
    console.error(`Cannot freeze run: ${latestDecision.id} decides an experiment on ${decidedAction.assumption_id}, but no locked experiment for it names the gate outcome of its success and failure rules.`);
    console.error('Design it with venture-experiment and run npm run experiment:lock before freezing.');
    process.exit(1);
  }
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

for (const reserved of ['evaluator', 'scores']) {
  if (fs.existsSync(path.join(runDir, reserved))) {
    console.error(`Cannot freeze run: ${reserved}/ already exists before freeze. This violates eval isolation.`);
    process.exit(1);
  }
}

const frozenAt = new Date().toISOString();
const evaluatorDir = path.join(runDir, 'evaluator');
fs.mkdirSync(evaluatorDir, { recursive: true });

const evaluatorSources = evaluatorSourcePaths(root, metadata.case, suite.referenceDir);
for (const [key, { source, file }] of Object.entries(evaluatorBundle)) {
  if (currentEvaluatorHashes[key] === null) {
    if (key === 'reference_sha256') continue;
    console.error(`Cannot freeze run: evaluator ${source} is missing.`);
    fs.rmSync(evaluatorDir, { recursive: true, force: true });
    process.exit(1);
  }
  fs.copyFileSync(evaluatorSources[source], path.join(evaluatorDir, file));
}

const freezeGit = gitProvenance(root);
const evaluatorProvenance = {
  case: metadata.case,
  suite: suiteLabel,
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

const digest = runDigest(runDir);
const marker = {
  run_id: runId,
  frozen_at: frozenAt,
  sha256: digest.sha256,
  files: digest.files,
  framework_sha256: currentRuntime.framework_sha256,
  evaluator_sources: currentEvaluatorHashes,
  rule: 'Run artifacts, frozen evaluator inputs and RESULT.md must not change after this marker is created. Scores — scores/ and a legacy SCORE.md — remain outside the frozen digest.'
};

fs.writeFileSync(frozenPath, JSON.stringify(marker, null, 2) + '\n');
console.log(`Frozen eval run ${runId}`);
console.log(`sha256: ${marker.sha256}`);
console.log(`framework sha256: ${marker.framework_sha256}`);
