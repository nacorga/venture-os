import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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

const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
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

if (!sameFiles || !sameHash) {
  console.error(`Frozen run integrity FAILED: ${runId}`);
  if (!sameFiles) console.error('File set changed after freeze.');
  if (!sameHash) console.error(`Expected ${marker.sha256}, got ${digest}`);
  process.exit(1);
}

console.log(`Frozen run integrity OK: ${runId}`);
console.log(`sha256: ${digest}`);
