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
import {
  evaluatorSourceHashes,
  runtimeProvenance,
  sha256File,
} from '../scripts/eval-provenance.mjs';

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

function validEvalState(slug) {
  const nextAction = {
    id: 'N004',
    type: 'positioning',
    assumption_id: null,
    instruction: 'Define evidence-constrained positioning.',
    success_signal: null,
    failure_signal: null,
    depends_on: [],
  };
  return {
    version: 2,
    name: 'Eval fixture',
    slug,
    stage: 'validation',
    thesis: {
      problem: 'A concrete problem',
      icp: 'A concrete ICP',
      solution: 'A candidate solution',
      business_model: 'Subscription',
      distribution: 'Founder-led sales',
    },
    assumptions: [],
    evidence_index: [],
    latest_decision: {
      id: 'D001',
      outcome: 'PROCEED',
      path: 'decisions/D001.md',
      snapshot: {
        next_action: structuredClone(nextAction),
        blocking_assumptions: [],
        blocking_deferrals: [],
        do_not_build: [],
        revisit_when: [],
        reopen_combination_rule: null,
      },
    },
    blocking_assumptions: [],
    blocking_deferrals: [],
    do_not_build: [],
    next_action: nextAction,
    revisit_when: [],
    reopen_combination_rule: null,
  };
}

function decisionProjection(state, title = '# Decision D001') {
  return `${title}\n\n<!-- venture-state-projection:start -->\n${YAML.stringify({
    decision_id: state.latest_decision.id,
    outcome: state.latest_decision.outcome,
    snapshot: state.latest_decision.snapshot,
  })}<!-- venture-state-projection:end -->\n`;
}

function createEvalRun(t, { complete = true, semantic = true } = {}) {
  const runId = uniqueId('test-eval');
  const runDir = path.join(repoRoot, 'evals', 'runs', runId);
  const ventureDir = path.join(runDir, 'venture');
  for (const sub of ['research', 'decisions', 'experiments', 'learning']) {
    fs.mkdirSync(path.join(ventureDir, sub), { recursive: true });
  }
  t.after(() => fs.rmSync(runDir, { recursive: true, force: true }));

  const caseId = 'test-case';
  const casePath = path.join(runDir, 'case.yaml');
  fs.writeFileSync(casePath, YAML.stringify(validCase({ id: caseId })));

  const state = validEvalState('test-eval');
  if (!semantic) {
    state.latest_decision = { id: null, outcome: null, path: null, snapshot: null };
    state.next_action = {
      id: 'N001',
      type: 'normalize',
      assumption_id: null,
      instruction: 'Normalize the idea.',
      success_signal: null,
      failure_signal: null,
      depends_on: [],
    };
  }
  fs.writeFileSync(path.join(ventureDir, 'venture.yaml'), YAML.stringify(state));

  if (semantic) {
    const projection = decisionProjection(state);
    fs.writeFileSync(path.join(ventureDir, 'decisions', 'D001.md'), projection);
    if (complete) fs.writeFileSync(path.join(runDir, 'RESULT.md'), decisionProjection(state, '# Result'));
  } else if (complete) {
    fs.writeFileSync(path.join(runDir, 'RESULT.md'), '# Result\n');
  }

  const runtime = runtimeProvenance(repoRoot);
  const metadata = {
    run_id: runId,
    case: caseId,
    case_schema_version: 1,
    model_label: 'test-model',
    created_at: new Date().toISOString(),
    commit: 'test',
    status: 'COMPLETE',
    provenance: {
      git: { commit: 'test', dirty: false, worktree_status_sha256: 'test' },
      case_sha256: sha256File(casePath),
      ...runtime,
      evaluator_sources: evaluatorSourceHashes(repoRoot, caseId),
    },
  };
  fs.writeFileSync(path.join(runDir, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');

  return { runId, runDir, ventureDir, metadataPath: path.join(runDir, 'metadata.json') };
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
  assert.equal(state.latest_decision?.snapshot, null);

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

test('semantically incomplete eval runs cannot be frozen', (t) => {
  const { runId } = createEvalRun(t, { semantic: false });
  const result = runScript('freeze-eval-run.mjs', runId);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no complete canonical gate decision/);
});

test('framework provenance drift prevents freeze', (t) => {
  const { runId, metadataPath } = createEvalRun(t);
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  metadata.provenance.framework_sha256 = '0'.repeat(64);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');

  const result = runScript('freeze-eval-run.mjs', runId);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /effective Venture OS runtime changed/);
});

test('freeze creates immutable marker and frozen evaluator bundle', (t) => {
  const { runId, runDir } = createEvalRun(t);

  const freeze = runScript('freeze-eval-run.mjs', runId);
  assert.equal(freeze.status, 0, `${freeze.stdout}\n${freeze.stderr}`);
  assert.equal(fs.existsSync(path.join(runDir, 'FROZEN.json')), true);
  assert.equal(fs.existsSync(path.join(runDir, 'evaluator', 'rubric.md')), true);
  assert.equal(fs.existsSync(path.join(runDir, 'evaluator', 'score-skill.md')), true);
  assert.equal(fs.existsSync(path.join(runDir, 'evaluator', 'PROVENANCE.json')), true);

  const metadata = JSON.parse(fs.readFileSync(path.join(runDir, 'metadata.json'), 'utf8'));
  assert.equal(metadata.status, 'FROZEN');
  assert.ok(metadata.frozen_at);
  assert.equal(metadata.freeze_provenance.framework_sha256, metadata.provenance.framework_sha256);

  const marker = JSON.parse(fs.readFileSync(path.join(runDir, 'FROZEN.json'), 'utf8'));
  assert.ok(marker.files.includes('evaluator/rubric.md'));
  assert.ok(marker.files.includes('evaluator/score-skill.md'));
  assert.ok(marker.files.includes('evaluator/PROVENANCE.json'));

  const verify = runScript('verify-eval-run.mjs', runId);
  assert.equal(verify.status, 0, verify.stderr);

  const secondFreeze = runScript('freeze-eval-run.mjs', runId);
  assert.notEqual(secondFreeze.status, 0);
  assert.match(secondFreeze.stderr, /already frozen/);
});

test('verify detects mutation of frozen venture artifacts', (t) => {
  const { runId, runDir } = createEvalRun(t);
  const freeze = runScript('freeze-eval-run.mjs', runId);
  assert.equal(freeze.status, 0, `${freeze.stdout}\n${freeze.stderr}`);

  fs.appendFileSync(path.join(runDir, 'venture', 'venture.yaml'), 'mutated: true\n');
  const verify = runScript('verify-eval-run.mjs', runId);
  assert.notEqual(verify.status, 0);
  assert.match(verify.stderr, /integrity FAILED/);
});

test('verify detects mutation of frozen evaluator inputs', (t) => {
  const { runId, runDir } = createEvalRun(t);
  const freeze = runScript('freeze-eval-run.mjs', runId);
  assert.equal(freeze.status, 0, `${freeze.stdout}\n${freeze.stderr}`);

  fs.appendFileSync(path.join(runDir, 'evaluator', 'rubric.md'), '\nmutated\n');
  const verify = runScript('verify-eval-run.mjs', runId);
  assert.notEqual(verify.status, 0);
  assert.match(verify.stderr, /integrity FAILED/);
});

test('SCORE.md remains outside the frozen artifact hash', (t) => {
  const { runId, runDir } = createEvalRun(t);
  const freeze = runScript('freeze-eval-run.mjs', runId);
  assert.equal(freeze.status, 0, `${freeze.stdout}\n${freeze.stderr}`);

  const scorePath = path.join(runDir, 'SCORE.md');
  fs.writeFileSync(scorePath, '# Score\n20/20\n');
  let verify = runScript('verify-eval-run.mjs', runId);
  assert.equal(verify.status, 0, verify.stderr);

  fs.writeFileSync(scorePath, '# Score\n19/20\n');
  verify = runScript('verify-eval-run.mjs', runId);
  assert.equal(verify.status, 0, verify.stderr);
});
