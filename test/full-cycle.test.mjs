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

function projection(decision) {
  return `# Decision ${decision.id}\n\n<!-- venture-state-projection:start -->\n${YAML.stringify({
    decision_id: decision.id,
    outcome: decision.outcome,
    snapshot: decision.snapshot,
  })}<!-- venture-state-projection:end -->\n`;
}

test('full cycle preserves the first decision and can change direction after contradictory evidence', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'venture-os-cycle-'));
  const ventureDir = path.join(root, 'venture');
  const experimentDir = path.join(ventureDir, 'experiments', 'X001-paid-intent');
  for (const child of ['research', 'decisions', 'learning']) fs.mkdirSync(path.join(ventureDir, child), { recursive: true });
  fs.mkdirSync(experimentDir, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const firstSnapshot = {
    next_action: {
      id: 'N004',
      type: 'experiment',
      assumption_id: 'A001',
      instruction: 'Design a paid-intent experiment.',
      success_signal: 'At least 3 paid commitments.',
      failure_signal: 'No paid commitments.',
      depends_on: [],
    },
    blocking_assumptions: ['A001'],
    blocking_deferrals: [],
    do_not_build: [],
    revisit_when: [],
    reopen_combination_rule: null,
  };

  const state = {
    version: 2,
    name: 'Sequential learning test',
    slug: 'sequential-learning-test',
    stage: 'experiment',
    thesis: {
      problem: 'Users have the problem',
      icp: 'Primary ICP',
      solution: 'Proposed service',
      business_model: 'Subscription',
      distribution: 'Founder-led sales',
    },
    assumptions: [{
      id: 'A001',
      statement: 'Qualified users will make a paid commitment.',
      category: 'willingness_to_pay',
      criticality: 'critical',
      status: 'supported',
      segment: 'primary-icp',
      evidence_ids: ['E001'],
    }],
    evidence_index: [{
      id: 'E001',
      type: 'first_party_qualitative',
      statement: 'Several qualified users described the problem as urgent.',
      source: null,
      observed_at: '2026-09-17',
      direction: 'supports',
      strength: 'medium',
      segment: 'primary-icp',
      transport_justification: null,
      assumption_ids: ['A001'],
    }],
    latest_decision: {
      id: 'D001',
      outcome: 'PROCEED',
      path: 'decisions/D001.md',
      snapshot: firstSnapshot,
    },
    blocking_assumptions: ['A001'],
    blocking_deferrals: [],
    do_not_build: [],
    next_action: {
      id: 'N005',
      type: 'experiment',
      assumption_id: 'A001',
      instruction: 'Execute X001.',
      success_signal: 'At least 3 paid commitments.',
      failure_signal: 'No paid commitments.',
      depends_on: [],
    },
    revisit_when: [],
    reopen_combination_rule: null,
  };

  const statePath = path.join(ventureDir, 'venture.yaml');
  fs.writeFileSync(statePath, YAML.stringify(state));
  const firstDecisionPath = path.join(ventureDir, 'decisions', 'D001.md');
  fs.writeFileSync(firstDecisionPath, projection(state.latest_decision));
  const firstDecisionBefore = fs.readFileSync(firstDecisionPath, 'utf8');

  const experimentPath = path.join(experimentDir, 'experiment.yaml');
  fs.writeFileSync(experimentPath, YAML.stringify({
    version: 1,
    id: 'X001',
    name: 'Paid intent test',
    status: 'designed',
    created_at: '2026-09-17',
    primary_assumption_id: 'A001',
    why_critical: 'Paid behavior decides whether to continue.',
    target: { description: '10 qualified primary-ICP prospects', sample_goal: 10 },
    procedure: ['Offer the same paid commitment to each qualified prospect.'],
    assets: ['Offer'],
    budget: { max_days: 7, max_cash: 100, currency: 'EUR' },
    signals: {
      success: ['At least 3 paid commitments'],
      failure: ['No paid commitments'],
      ambiguous: ['1-2 paid commitments'],
    },
    decision_rules: {
      on_success: 'Proceed.',
      on_failure: 'Park and define a concrete reopen trigger.',
      on_ambiguous: 'Run one narrower follow-up test.',
    },
    preregistration: { locked_at: null, sha256: null },
    results: { observations: [], evidence_ids: [], completed_at: null },
  }));

  const lock = run('lock-experiment.mjs', experimentPath);
  assert.equal(lock.status, 0, lock.stderr);

  const completedExperiment = YAML.parse(fs.readFileSync(experimentPath, 'utf8'));
  completedExperiment.status = 'completed';
  completedExperiment.results = {
    observations: ['0 of 10 qualified prospects made the preregistered paid commitment.'],
    evidence_ids: ['E002'],
    completed_at: '2026-09-17T12:00:00Z',
  };
  fs.writeFileSync(experimentPath, YAML.stringify(completedExperiment));

  state.assumptions[0].status = 'contradicted';
  state.assumptions[0].evidence_ids = ['E001', 'E002'];
  state.evidence_index.push({
    id: 'E002',
    type: 'first_party_behavioral',
    statement: '0 of 10 qualified prospects made the preregistered paid commitment.',
    source: 'X001',
    observed_at: '2026-09-17',
    direction: 'contradicts',
    strength: 'strong',
    segment: 'primary-icp',
    transport_justification: null,
    assumption_ids: ['A001'],
  });
  fs.writeFileSync(path.join(ventureDir, 'learning', 'L001.md'), '# Learning L001\n\nE002 contradicts A001 after X001.\n');

  const secondSnapshot = {
    next_action: {
      id: 'N007',
      type: 'other',
      assumption_id: 'A001',
      instruction: 'Stop current build work and wait for the reopen condition.',
      success_signal: 'A new behavioral signal satisfies T001.',
      failure_signal: null,
      depends_on: [],
    },
    blocking_assumptions: ['A001'],
    blocking_deferrals: [],
    do_not_build: [{
      id: 'DNB001',
      statement: 'Do not build the production product under the current willingness-to-pay thesis.',
      reason: 'X001 contradicted A001.',
      evidence_ids: ['E002'],
    }],
    revisit_when: [{
      id: 'T001',
      condition: 'New first-party behavioral evidence shows paid commitment from the same ICP.',
      check: 'Run a newly preregistered paid-intent experiment.',
    }],
    reopen_combination_rule: { all_of: ['T001'], any_of: [], note: 'Reopen only on behavioral evidence.' },
  };

  state.stage = 'parked';
  state.latest_decision = {
    id: 'D002',
    outcome: 'PARK',
    path: 'decisions/D002.md',
    snapshot: secondSnapshot,
  };
  state.blocking_assumptions = secondSnapshot.blocking_assumptions;
  state.blocking_deferrals = secondSnapshot.blocking_deferrals;
  state.do_not_build = secondSnapshot.do_not_build;
  state.next_action = secondSnapshot.next_action;
  state.revisit_when = secondSnapshot.revisit_when;
  state.reopen_combination_rule = secondSnapshot.reopen_combination_rule;
  fs.writeFileSync(statePath, YAML.stringify(state));
  fs.writeFileSync(path.join(ventureDir, 'decisions', 'D002.md'), projection(state.latest_decision));

  const check = run('check-state-integrity.mjs', ventureDir);
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  assert.equal(fs.readFileSync(firstDecisionPath, 'utf8'), firstDecisionBefore, 'D001 must remain immutable');
  assert.equal(state.latest_decision.outcome, 'PARK');
  assert.equal(state.assumptions[0].status, 'contradicted');
});
