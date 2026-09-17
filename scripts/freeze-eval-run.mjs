import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateCaseFile } from './case-utils.mjs';
import { frameworkHash, gitState, sha256File } from './eval-provenance.mjs';

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

if (!metadata.provenance?.framework_sha256 || !metadata.provenance?.case_sha256) {
  console.error('Cannot freeze run: provenance metadata is missing. Create a new eval run with the current harness.');
  process.exit(1);
}

const casePath = path.join(runDir, 'case.yaml');
const caseResult = validateCaseFile(casePath);
if (!caseResult.valid) {
  console.error('Cannot freeze run: case.yaml is invalid.');
  for (const error of caseResult.errors) console.error(`  - ${error}`);
  process.exit(1);
}
if (sha256File(casePath) !== metadata.provenance.case_sha256) {
  console.error('Cannot freeze run: case.yaml differs from the case captured at eval creation.');
  process.exit(1);
}

const currentFrameworkHash = frameworkHash(root);
if (currentFrameworkHash !== metadata.provenance.framework_sha256) {
  console.error('Cannot freeze run: effective Venture OS framework changed after eval creation.');
  console.error(`created: ${metadata.provenance.framework_sha256}`);
  console.error(`current: ${currentFrameworkHash}`);
  console.error('Create a new eval run so one run measures one framework version.');
  process.exit(1);
}

const integrity = spawnSync(
  process.execPath,
  [path.join(root, 'scripts', 'check-state-integrity.mjs'), path.join(runDir, 'venture')],
  { cwd: root, encoding: 'utf8' },
);
if (integrity.stdout) process.stdout.write(integrity.stdout);
if (integrity.stderr) process.stderr.write(integrity.stderr);
if (integrity.status !== 0) {
  console.error('Cannot freeze run: venture artifacts are not semantically valid.');
  process.exit(1);
}

const frozenAt = new Date().toISOString();
const freezeGit = gitState(root);
metadata.status = 'FROZEN';
metadata.frozen_at = frozenAt;
metadata.provenance.freeze_commit = freezeGit.commit;
metadata.provenance.freeze_working_tree_dirty = freezeGit.working_tree_dirty;
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
  framework_sha256: metadata.provenance.framework_sha256,
  rubric_sha256: metadata.provenance.rubric_sha256 ?? null,
  reference_sha256: metadata.provenance.reference_sha256 ?? null,
  files,
  rule: 'Venture artifacts and RESULT.md must not change after this marker is created.',
};

fs.writeFileSync(frozenPath, JSON.stringify(marker, null, 2) + '\n');
console.log(`Frozen eval run ${runId}`);
console.log(`sha256: ${marker.sha256}`);
