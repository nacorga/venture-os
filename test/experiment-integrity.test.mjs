import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runScript(script, ...args) {
  return spawnSync(process.execPath, [path.join(repoRoot, 'scripts', script), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function baseState() {
  return {
    version: 2,
    name: 'Experiment integrity test',
    slug: 'experiment-integrity-test',
    stage: 'experiment',
    thesis: {
      problem: 'A real problem',
      icp: 'A specific ICP',
      solution: 'A proposed solution',
      business_model: 'Subscription',
      distribution: 'Founder-led sales',
    },
    assumptions: [
      {
        id: 'A001',
        statement: 'The ICP will take the target behavior',
        category: 'willingness_to_pay',
        criticality: 'critical',
        status: 'supported',
        segment: 'primary-icp',
        evidence_ids: ['E001'],
      },
    ],
    evidence_index: [
      {
        id: 'E001',
        type: 'first_party_behavioral',
        statement: 'Existing behavioral evidence',
        source: null,
        observed_at: '2026-09-17',
        direction: 'supports',
        strength: 'medium',
        segment: 'primary-icp',
        transport_justification: null,
        assumption_ids: ['A001'],
      },
    ],
    latest_decision: { id: null, outcome: null, path: null, snapshot: null },
    blocking_assumptions: [],
    blocking_deferrals: [],
    do_not_build: [],
    next_action: {
      id: 'N004',
      type: 'experiment',
      assumption_id: 'A001',
      instruction: 'Execute X001.',
      success_signal: 'Target behavior occurs.',
      failure_signal: 'Target behavior does not occur.',
      depends_on: [],
    },
    revisit_when: [],
    reopen_combination_rule: null,
  };
}

function baseExperiment() {
  return {
    version: 1,
    id: 'X001',
    name: 'Behavioral smoke experiment',
    status: 'designed',
    created_at: null,
    primary_assumption_id: 'A001',
    why_critical: 'It resolves the current demand uncertainty.',
    target: {
      description: 'Primary ICP',
      sample_goal: 3,
    },
    procedure: ['Present the offer', 'Record the target behavior'],
    assets: ['Offer page'],
    budget: {
      max_days: 3,
      max_cash: 50,
      currency: 'EUR',
    },
    signals: {
      success: ['At least two target behaviors occur'],
      failure: ['No target behavior occurs'],
      ambiguous: ['Exactly one target behavior occurs'],
    },
    decision_rules: {
      on_success: 'Proceed to the next uncertainty.',
      on_failure: 'Revisit the demand thesis.',
      on_ambiguous: 'Run one bounded follow-up test.',
    },
    preregistration: {
      locked_at: null,
      design: null,
    },
    results: {
      observations: [],
      evidence_ids: [],
      completed_at: null,
    },
  };
}

function createFixture(t, experiment = baseExperiment()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'venture-os-experiment-'));
  const ventureDir = path.join(root, 'venture');
  const experimentDir = path.join(ventureDir, 'experiments', 'X001-behavioral-smoke');
  for (const dir of ['research', 'decisions', 'learning', 'experiments']) {
    fs.mkdirSync(path.join(ventureDir, dir), { recursive: true });
  }
  fs.mkdirSync(experimentDir, { recursive: true });
  fs.writeFileSync(path.join(ventureDir, 'venture.yaml'), YAML.stringify(baseState()));
  const experimentPath = path.join(experimentDir, 'experiment.yaml');
  fs.writeFileSync(experimentPath, YAML.stringify(experiment));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { ventureDir, experimentPath };
}

test('experiment:lock stores an immutable decision-relevant design snapshot', (t) => {
  const { ventureDir, experimentPath } = createFixture(t);
  const lock = runScript('lock-experiment.mjs', experimentPath);
  assert.equal(lock.status, 0, `${lock.stdout}\n${lock.stderr}`);

  const locked = YAML.parse(fs.readFileSync(experimentPath, 'utf8'));
  assert.equal(locked.status, 'designed');
  assert.ok(locked.preregistration.locked_at);
  assert.equal(locked.preregistration.design.primary_assumption_id, 'A001');
  assert.deepEqual(locked.preregistration.design.signals, locked.signals);

  locked.status = 'running';
  fs.writeFileSync(experimentPath, YAML.stringify(locked));
  const check = runScript('check-experiment-consistency.mjs', ventureDir);
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
});

test('running experiment without preregistration is rejected', (t) => {
  const experiment = baseExperiment();
  experiment.status = 'running';
  const { ventureDir } = createFixture(t, experiment);
  const check = runScript('check-experiment-consistency.mjs', ventureDir);
  assert.notEqual(check.status, 0);
  assert.match(check.stderr, /requires a locked preregistration/);
});

test('changing decision-relevant design after lock is rejected', (t) => {
  const { ventureDir, experimentPath } = createFixture(t);
  const lock = runScript('lock-experiment.mjs', experimentPath);
  assert.equal(lock.status, 0, `${lock.stdout}\n${lock.stderr}`);

  const experiment = YAML.parse(fs.readFileSync(experimentPath, 'utf8'));
  experiment.status = 'running';
  experiment.signals.success = ['A looser success threshold'];
  fs.writeFileSync(experimentPath, YAML.stringify(experiment));

  const check = runScript('check-experiment-consistency.mjs', ventureDir);
  assert.notEqual(check.status, 0);
  assert.match(check.stderr, /design differs from its preregistered snapshot/);
});

test('experiment assumption and result evidence references must exist', (t) => {
  const experiment = baseExperiment();
  experiment.primary_assumption_id = 'A999';
  experiment.results.evidence_ids = ['E999'];
  const { ventureDir } = createFixture(t, experiment);

  const check = runScript('check-experiment-consistency.mjs', ventureDir);
  assert.notEqual(check.status, 0);
  assert.match(check.stderr, /references missing assumption A999/);
  assert.match(check.stderr, /results reference missing evidence E999/);
});

test('evidence:check wrapper includes experiment consistency', (t) => {
  const experiment = baseExperiment();
  experiment.status = 'running';
  const { ventureDir } = createFixture(t, experiment);
  const check = runScript('check-venture-integrity.mjs', ventureDir);
  assert.notEqual(check.status, 0);
  assert.match(check.stderr, /requires a locked preregistration/);
});

test('generated venture workspaces are gitignored by default', () => {
  const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
  assert.match(gitignore, /^ventures\/\*$/m);
  assert.match(gitignore, /^!ventures\/\.gitkeep$/m);

  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['experiment:lock'], 'node scripts/lock-experiment.mjs');
  assert.equal(pkg.scripts['evidence:check'], 'node scripts/check-venture-integrity.mjs');
});
