import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatorContext } from '../scripts/eval-provenance.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let sequence = 0;

function runContext(runId) {
  return spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'verify-eval-context.mjs'), runId], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function createMetadataRun(t, provenance) {
  sequence += 1;
  const runId = `test-context-${process.pid}-${sequence}`;
  const runDir = path.join(repoRoot, 'evals', 'runs', runId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'metadata.json'), JSON.stringify({
    case: 'inventory-monitoring-saas',
    provenance,
  }, null, 2) + '\n');
  t.after(() => fs.rmSync(runDir, { recursive: true, force: true }));
  return runId;
}

test('eval context accepts the pinned rubric and reference', (t) => {
  const context = evaluatorContext(repoRoot, 'inventory-monitoring-saas');
  const runId = createMetadataRun(t, context);
  const result = runContext(runId);
  assert.equal(result.status, 0, result.stderr);
});

test('eval context refuses silently changed evaluator criteria', (t) => {
  const context = evaluatorContext(repoRoot, 'inventory-monitoring-saas');
  const runId = createMetadataRun(t, {
    ...context,
    rubric_sha256: '0'.repeat(64),
  });
  const result = runContext(runId);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Evaluator rubric changed/);
});
