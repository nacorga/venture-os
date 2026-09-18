import path from 'node:path';
import { verifyFrozenRun } from './eval-provenance.mjs';

const [runId] = process.argv.slice(2);
if (!runId || runId.includes('/') || runId.includes('..')) {
  console.error('Usage: npm run eval:verify -- <run-id>');
  process.exit(1);
}

const runDir = path.join(process.cwd(), 'evals', 'runs', runId);
const result = verifyFrozenRun(runDir);

if (!result.ok) {
  for (const error of result.errors) console.error(error);
  console.error(`Frozen run integrity FAILED: ${runId}`);
  process.exit(1);
}

console.log(`Frozen run integrity OK: ${runId}`);
console.log(`sha256: ${result.digest}`);
console.log(`framework sha256: ${result.marker.framework_sha256 ?? 'unknown'}`);
