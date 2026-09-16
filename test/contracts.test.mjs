import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import {
  parseCaseFile,
  validateCaseFile,
  validateCaseObject,
} from '../scripts/case-utils.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let sequence = 0;

function uniqueId(prefix) {
  sequence += 1;
  return `${prefix}-${process.pid}-${sequence}`;
}

function runScript(scriptName, ...args) {
  return spawnSync(process.execPath, [path.join(repoRoot, 'scripts', scriptName), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function validCase(overrides = {}) {
  return {
    schema_version: 1,
    id: 'valid-case',
    title: 'Valid synthetic case',
    statement: 'A sufficiently detailed synthetic business statement for deterministic schema validation.',
    categories: ['b2b-saas'],
    tags: ['testing'],
    provenance: { type: 'synthetic' },
    ...overrides,
  };
}

function createEvalRun(t, { complete = true } = {}) {
  const runId = uniqueId('test-eval');
  const runDir = path.join(repoRoot, 'evals', 'runs', runId);
  fs.mkdirSync(path.join(runDir, 'venture'), { recursive: true });
  t.after(() => fs.rmSync(runDir, { recursive: true, force: true }));

  fs.writeFileSync(path.join(runDir, 'case.yaml'), 'schema_version: 1\nid: test-case\n');
  fs.writeFileSync(path.join(runDir, 'metadata.json'), JSON.stringify({ status: 'COMPLETE' }, null, 2) + '\n');
  fs.writeFileSync(path.join(runDir, 'venture', 'venture.yaml'), 'version: 2\nstage: validation\n');
  if (complete) fs.writeFileSync(path.join(runDir, 'RESULT.md'), '# Result\n');

  return { runId, runDir };
}

test('Case Library accepts a valid synthetic case', () => {
  const result = validateCaseObject(validCase());
  assert.equal(result.valid, true, result.errors.join('\n'));
});

test('Case Library rejects unknown top-level fields', () => {
  const result = validateCaseObject(validCase({ unexpected: true }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("unexpected field 'unexpected'")));
});

test('public-real cases require source_url', () => {
  const result = validateCaseObject(validCase({ provenance: { type: 'public-real' } }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('source_url')));
});

test('case parser rejects malformed YAML', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'venture-os-case-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'case.yaml');
  fs.writeFileSync(file, 'id: [unterminated\n');

  const result = parseCaseFile(file);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('invalid YAML')));
});

test('case parser rejects duplicate YAML keys', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'venture-os-case-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'case.yaml');
  fs.writeFileSync(file, 'id: first\nid: second\n');

  const result = parseCaseFile(file);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('invalid YAML')));
});

test('public case id must match its directory name', (t) => {
  const directoryId = uniqueId('test-case');
  const dir = path.join(repoRoot, 'cases', directoryId);
  const file = path.join(dir, 'case.yaml');
  fs.mkdirSync(dir, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const value = validCase({ id: 'different-id' });
  fs.writeFileSync(file, YAML.stringify(value));

  const result = validateCaseFile(file);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('must match directory name')));
});

test('venture:new rejects invalid slugs', () => {
  const result = runScript('new-venture.mjs', 'Invalid_Slug', 'A test idea');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Slug must contain only lowercase letters, numbers and hyphens/);
});

test('venture:new creates canonical v2 state and expected directories', (t) => {
  const slug = uniqueId('test-venture');
  const dir = path.join(repoRoot, 'ventures', slug);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const result = runScript('new-venture.mjs', slug, 'A deterministic venture creation test');
  assert.equal(result.status, 0, result.stderr);

  const state = YAML.parse(fs.readFileSync(path.join(dir, 'venture.yaml'), 'utf8'));
  assert.equal(state.version, 2);
  assert.equal(state.slug, slug);
  assert.equal(state.stage, 'concept');
  assert.equal(state.next_action?.id, 'N001');

  for (const child of ['research', 'decisions', 'experiments', 'learning']) {
    assert.equal(fs.statSync(path.join(dir, child)).isDirectory(), true);
  }
});

test('venture:new rejects duplicates without overwriting state', (t) => {
  const slug = uniqueId('test-venture');
  const dir = path.join(repoRoot, 'ventures', slug);
  const statePath = path.join(dir, 'venture.yaml');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const first = runScript('new-venture.mjs', slug, 'Original idea');
  assert.equal(first.status, 0, first.stderr);
  const before = fs.readFileSync(statePath, 'utf8');

  const second = runScript('new-venture.mjs', slug, 'Replacement idea');
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /Venture already exists/);
  assert.equal(fs.readFileSync(statePath, 'utf8'), before);
});

test('incomplete eval runs cannot be frozen', (t) => {
  const { runId } = createEvalRun(t, { complete: false });
  const result = runScript('freeze-eval-run.mjs', runId);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Cannot freeze incomplete run/);
});

test('freeze creates immutable marker, updates metadata, and rejects a second freeze', (t) => {
  const { runId, runDir } = createEvalRun(t);

  const freeze = runScript('freeze-eval-run.mjs', runId);
  assert.equal(freeze.status, 0, freeze.stderr);
  assert.equal(fs.existsSync(path.join(runDir, 'FROZEN.json')), true);

  const metadata = JSON.parse(fs.readFileSync(path.join(runDir, 'metadata.json'), 'utf8'));
  assert.equal(metadata.status, 'FROZEN');
  assert.ok(metadata.frozen_at);

  const verify = runScript('verify-eval-run.mjs', runId);
  assert.equal(verify.status, 0, verify.stderr);

  const secondFreeze = runScript('freeze-eval-run.mjs', runId);
  assert.notEqual(secondFreeze.status, 0);
  assert.match(secondFreeze.stderr, /already frozen/);
});

test('verify detects mutation of frozen venture artifacts', (t) => {
  const { runId, runDir } = createEvalRun(t);
  const freeze = runScript('freeze-eval-run.mjs', runId);
  assert.equal(freeze.status, 0, freeze.stderr);

  fs.appendFileSync(path.join(runDir, 'venture', 'venture.yaml'), 'mutated: true\n');
  const verify = runScript('verify-eval-run.mjs', runId);
  assert.notEqual(verify.status, 0);
  assert.match(verify.stderr, /integrity FAILED/);
});

test('SCORE.md remains outside the frozen artifact hash', (t) => {
  const { runId, runDir } = createEvalRun(t);
  const freeze = runScript('freeze-eval-run.mjs', runId);
  assert.equal(freeze.status, 0, freeze.stderr);

  const scorePath = path.join(runDir, 'SCORE.md');
  fs.writeFileSync(scorePath, '# Score\n20/20\n');
  let verify = runScript('verify-eval-run.mjs', runId);
  assert.equal(verify.status, 0, verify.stderr);

  fs.writeFileSync(scorePath, '# Score\n19/20\n');
  verify = runScript('verify-eval-run.mjs', runId);
  assert.equal(verify.status, 0, verify.stderr);
});
