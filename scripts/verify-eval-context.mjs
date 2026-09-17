import fs from 'node:fs';
import path from 'node:path';
import { evaluatorContext } from './eval-provenance.mjs';

const [runId] = process.argv.slice(2);
if (!runId || runId.includes('/') || runId.includes('..')) {
  console.error('Usage: npm run eval:context -- <run-id>');
  process.exit(1);
}

const root = process.cwd();
const runDir = path.join(root, 'evals', 'runs', runId);
const metadataPath = path.join(runDir, 'metadata.json');
if (!fs.existsSync(metadataPath)) {
  console.error(`Eval metadata not found: ${runId}`);
  process.exit(1);
}

let metadata;
try {
  metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
} catch {
  console.error('Eval metadata is not valid JSON.');
  process.exit(1);
}

const expected = metadata.provenance;
if (!expected?.rubric_sha256 || !expected?.reference_sha256) {
  console.error('Eval run does not pin evaluator rubric/reference hashes. Create a new run with the current harness.');
  process.exit(1);
}

const current = evaluatorContext(root, metadata.case);
let ok = true;
if (current.rubric_sha256 !== expected.rubric_sha256) {
  console.error('Evaluator rubric changed since this run was created.');
  console.error(`created: ${expected.rubric_sha256}`);
  console.error(`current: ${current.rubric_sha256}`);
  ok = false;
}
if (current.reference_sha256 !== expected.reference_sha256) {
  console.error('Evaluator reference changed since this run was created.');
  console.error(`created: ${expected.reference_sha256}`);
  console.error(`current: ${current.reference_sha256}`);
  ok = false;
}

if (!ok) {
  console.error('Score this run from the pinned repository revision or create a new run.');
  process.exit(1);
}

console.log(`Eval context OK: ${runId}`);
console.log(`rubric sha256: ${current.rubric_sha256}`);
console.log(`reference sha256: ${current.reference_sha256}`);
