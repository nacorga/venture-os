import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sha256File } from './eval-provenance.mjs';

const [runId] = process.argv.slice(2);
if (!runId || runId.includes('/') || runId.includes('..')) {
  console.error('Usage: npm run eval:verify -- <run-id>');
  process.exit(1);
}

const root = process.cwd();
const runDir = path.join(root, 'evals', 'runs', runId);
const markerPath = path.join(runDir, 'FROZEN.json');

if (!fs.existsSync(markerPath)) {
  console.error(`Run is not frozen: ${runId}`);
  process.exit(1);
}

let marker;
try {
  marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
} catch {
  console.error(`Frozen marker is invalid JSON: ${runId}`);
  process.exit(1);
}

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

const digest = hash.digest('hex');
const expectedFiles = Array.isArray(marker.files) ? [...marker.files].sort() : [];
const sameFiles = JSON.stringify(files) === JSON.stringify(expectedFiles);
const sameHash = digest === marker.sha256;

let provenanceOk = true;
function provenanceFailure(message) {
  console.error(message);
  provenanceOk = false;
}

const evaluatorHashes = marker.evaluator_sources ?? {};
const evaluatorFiles = {
  reference_sha256: path.join(runDir, 'evaluator', 'reference.yaml'),
  rubric_sha256: path.join(runDir, 'evaluator', 'rubric.md'),
  score_skill_sha256: path.join(runDir, 'evaluator', 'score-skill.md'),
};
for (const [key, filePath] of Object.entries(evaluatorFiles)) {
  const expected = evaluatorHashes[key] ?? null;
  if (expected === null) {
    if (key === 'reference_sha256' && fs.existsSync(filePath)) {
      provenanceFailure('Frozen evaluator reference exists but marker records no reference hash.');
    }
    continue;
  }
  if (!fs.existsSync(filePath)) {
    provenanceFailure(`Frozen evaluator input missing: ${path.relative(runDir, filePath)}`);
    continue;
  }
  if (sha256File(filePath) !== expected) {
    provenanceFailure(`Frozen evaluator input hash mismatch: ${path.relative(runDir, filePath)}`);
  }
}

const evaluatorProvenancePath = path.join(runDir, 'evaluator', 'PROVENANCE.json');
if (!fs.existsSync(evaluatorProvenancePath)) {
  provenanceFailure('Frozen evaluator provenance is missing.');
} else {
  try {
    const evaluatorProvenance = JSON.parse(fs.readFileSync(evaluatorProvenancePath, 'utf8'));
    if (evaluatorProvenance.framework_sha256 !== marker.framework_sha256) {
      provenanceFailure('Frozen evaluator framework hash does not match FROZEN.json.');
    }
    for (const key of ['reference_sha256', 'rubric_sha256', 'score_skill_sha256']) {
      if ((evaluatorProvenance.evaluator_sources?.[key] ?? null) !== (evaluatorHashes[key] ?? null)) {
        provenanceFailure(`Frozen evaluator provenance disagrees on ${key}.`);
      }
    }
  } catch {
    provenanceFailure('Frozen evaluator PROVENANCE.json is invalid JSON.');
  }
}

if (!sameFiles || !sameHash || !provenanceOk) {
  console.error(`Frozen run integrity FAILED: ${runId}`);
  if (!sameFiles) console.error('File set changed after freeze.');
  if (!sameHash) console.error(`Expected ${marker.sha256}, got ${digest}`);
  process.exit(1);
}

console.log(`Frozen run integrity OK: ${runId}`);
console.log(`sha256: ${digest}`);
console.log(`framework sha256: ${marker.framework_sha256 ?? 'unknown'}`);
