import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(script, ...args) {
  return spawnSync(process.execPath, [path.join(repoRoot, 'scripts', script), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function state() {
  return {
    version: 2,
    name: 'Experiment integrity',
    slug: 'experiment-integrity',
    stage: 'experiment',
    thesis: {
      problem: 'Problem', icp: 'ICP', solution: 'Solution', business_model: 'Subscription', distribution: 'Sales',
    },
    assumptions: [{
      id: 'A001', statement: 'Users will pay', category: 'willingness_to_pay', criticality: 'critical', status: 'unknown', segment: null, evidence_ids: [],
    }],
    evidence_index: [],
    latest_decision: { id: null, outcome: null, path: null, snapshot: null },
    blocking_assumptions: ['A001'],
    blocking_deferrals: [],
    do_not_build: [],
    next_action: {
      id: 'N004', type: 'experiment', assumption_id: 'A001', instruction: 'Execute X001.', success_signal: '3 paid commitments', failure_signal: '0 paid commitments', depends_on: [],
    },
    revisit_when: [],
    reopen_combination_rule: null,
  };
}

function experiment(overrides = {}) {
  return {
    version: 1,
    id: 'X001',
    name: 'Paid commitment test',
    status: 'designed',
    created_at: '2026-09-17',
    primary_assumption_id: 'A001',
    why_critical: 'Payment behavior decides whether to continue.',
    target: { description: 'Primary ICP', sample_goal: 10 },
    procedure: ['Offer the same paid commitment to 10 qualified prospects.'],
    assets: ['Offer page'],
    budget: { max_days: 7, max_cash: 100, currency: 'EUR' },
    signals: {
      success: ['At least 3 paid commitments'],
      failure: ['No paid commitments'],
      ambiguous: ['1-2 paid commitments'],
    },
    decision_rules: {
      on_success: 'Proceed to the next gate.',
      on_failure: 'Park or revise the willingness-to-pay thesis.',
      on_ambiguous: 'Run one narrower follow-up test.',
    },
    preregistration: { locked_at: null, sha256: null },
    results: { observations: [], evidence_ids: [], completed_at: null },
    ...overrides,
  };
}

function fixture(t, exp = experiment()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'venture-os-experiment-'));
  const ventureDir = path.join(root, 'venture');
  const expDir = path.join(ventureDir, 'experiments', 'X001-paid-commitment');
  for (const child of ['research', 'decisions', 'learning']) fs.mkdirSync(path.join(ventureDir, child), { recursive: true });
  fs.mkdirSync(expDir, { recursive: true });
  fs.writeFileSync(path.join(ventureDir, 'venture.yaml'), YAML.stringify(state()));
  const expPath = path.join(expDir, 'experiment.yaml');
  fs.writeFileSync(expPath, YAML.stringify(exp));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { ventureDir, expPath };
}

test('local venture workspaces are ignored by git by default', () => {
  const ignored = spawnSync('git', ['check-ignore', 'ventures/private-demo/venture.yaml'], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(ignored.status, 0, ignored.stderr);
  const keep = spawnSync('git', ['check-ignore', 'ventures/.gitkeep'], { cwd: repoRoot, encoding: 'utf8' });
  assert.notEqual(keep.status, 0);
});

test('experiment references must target an existing assumption', (t) => {
  const { ventureDir } = fixture(t, experiment({ primary_assumption_id: 'A999' }));
  const result = run('check-state-integrity.mjs', ventureDir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing assumption A999/);
});

test('experiment lock preregisters the decision-relevant design', (t) => {
  const { ventureDir, expPath } = fixture(t);
  const lock = run('lock-experiment.mjs', expPath);
  assert.equal(lock.status, 0, lock.stderr);

  const locked = YAML.parse(fs.readFileSync(expPath, 'utf8'));
  assert.equal(locked.status, 'running');
  assert.match(locked.preregistration.sha256, /^[a-f0-9]{64}$/);
  assert.ok(locked.preregistration.locked_at);

  const check = run('check-state-integrity.mjs', ventureDir);
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
});

test('changing experiment criteria after lock is an integrity failure', (t) => {
  const { ventureDir, expPath } = fixture(t);
  const lock = run('lock-experiment.mjs', expPath);
  assert.equal(lock.status, 0, lock.stderr);

  const locked = YAML.parse(fs.readFileSync(expPath, 'utf8'));
  locked.signals.success = ['At least 1 paid commitment'];
  fs.writeFileSync(expPath, YAML.stringify(locked));

  const check = run('check-state-integrity.mjs', ventureDir);
  assert.notEqual(check.status, 0);
  assert.match(check.stderr, /design changed after preregistration lock/);
});
