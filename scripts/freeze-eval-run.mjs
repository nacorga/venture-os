import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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

const frozenAt = new Date().toISOString();
const metadataPath = path.join(runDir, 'metadata.json');
let metadata;
try {
  metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
} catch {
  console.error('Cannot freeze run: metadata.json is not valid JSON.');
  process.exit(1);
}
metadata.status = 'FROZEN';
metadata.frozen_at = frozenAt;
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
  rule: 'Venture artifacts and RESULT.md must not change after this marker is created.'
};

fs.writeFileSync(frozenPath, JSON.stringify(marker, null, 2) + '\n');
console.log(`Frozen eval run ${runId}`);
console.log(`sha256: ${marker.sha256}`);
