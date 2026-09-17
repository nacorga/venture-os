import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runEvidenceCheck(ventureDir) {
  return spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'check-evidence-consistency.mjs'), ventureDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function baseState() {
  return {
    version: 2,
    name: 'State integrity test',
    slug: 'state-integrity-test',
    stage: 'validation',
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
        statement: 'The ICP experiences the problem',
        category: 'problem',
        criticality: 'critical',
        status: 'supported',
        segment: 'primary-icp',
        evidence_ids: ['E001'],
      },
    ],
    evidence_index: [
      {
        id: 'E001',
        type: 'first_party_qualitative',
        statement: 'Observed evidence',
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
      id: 'N003',
      type: 'decision',
      assumption_id: 'A001',
      instruction: 'Make the gate decision.',
      success_signal: null,
      failure_signal: null,
      depends_on: [],
    },
    revisit_when: [],
    reopen_combination_rule: null,
  };
}

function createVenture(t, state = baseState()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'venture-os-state-'));
  const ventureDir = path.join(root, 'venture');
  for (const child of ['research', 'decisions', 'experiments', 'learning']) {
    fs.mkdirSync(path.join(ventureDir, child), { recursive: true });
  }
  fs.writeFileSync(path.join(ventureDir, 'venture.yaml'), YAML.stringify(state));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return ventureDir;
}

function decisionProjection(state) {
  return `# Decision ${state.latest_decision.id}\n\n<!-- venture-state-projection:start -->\n${YAML.stringify({
    decision_id: state.latest_decision.id,
    outcome: state.latest_decision.outcome,
    snapshot: state.latest_decision.snapshot,
  })}<!-- venture-state-projection:end -->\n`;
}

test('evidence:check rejects malformed venture YAML', (t) => {
  const ventureDir = createVenture(t);
  fs.writeFileSync(path.join(ventureDir, 'venture.yaml'), 'version: 2\nassumptions: [unterminated\n');
  const result = runEvidenceCheck(ventureDir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /invalid venture\.yaml/);
});

test('schema rejects invalid stage and decision outcome', (t) => {
  const state = baseState();
  state.stage = 'launch';
  state.latest_decision = { id: 'D001', outcome: 'LAUNCH', path: 'decisions/D001.md', snapshot: {} };
  const ventureDir = createVenture(t, state);
  const result = runEvidenceCheck(ventureDir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /stage|outcome/);
});

test('inline YAML evidence references cannot bypass missing-reference checks', (t) => {
  const state = baseState();
  state.assumptions[0].evidence_ids = ['E999'];
  const ventureDir = createVenture(t, state);
  const result = runEvidenceCheck(ventureDir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /A001 references missing evidence E999/);
});

test('decision snapshot remains valid after current next_action advances', (t) => {
  const state = baseState();
  const snapshot = {
    next_action: {
      id: 'N004',
      type: 'positioning',
      assumption_id: 'A001',
      instruction: 'Define evidence-constrained positioning.',
      success_signal: 'One testable offer is defined.',
      failure_signal: 'Positioning still depends on unsupported claims.',
      depends_on: [],
    },
    blocking_assumptions: [],
    blocking_deferrals: [],
    do_not_build: [],
    revisit_when: [],
    reopen_combination_rule: null,
  };
  state.latest_decision = { id: 'D001', outcome: 'PROCEED', path: 'decisions/D001.md', snapshot };
  state.next_action = {
    id: 'N005',
    type: 'experiment',
    assumption_id: 'A001',
    instruction: 'Design the market experiment.',
    success_signal: 'Experiment is preregistered.',
    failure_signal: 'No decision-changing test can be defined.',
    depends_on: [],
  };
  state.stage = 'positioning';

  const ventureDir = createVenture(t, state);
  fs.writeFileSync(path.join(ventureDir, 'decisions', 'D001.md'), decisionProjection(state));

  const result = runEvidenceCheck(ventureDir);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('decision projection cannot contradict canonical decision outcome', (t) => {
  const state = baseState();
  state.latest_decision = {
    id: 'D001',
    outcome: 'PROCEED',
    path: 'decisions/D001.md',
    snapshot: {
      next_action: state.next_action,
      blocking_assumptions: [],
      blocking_deferrals: [],
      do_not_build: [],
      revisit_when: [],
      reopen_combination_rule: null,
    },
  };
  const ventureDir = createVenture(t, state);
  const source = decisionProjection(state).replace('outcome: PROCEED', 'outcome: PARK');
  fs.writeFileSync(path.join(ventureDir, 'decisions', 'D001.md'), source);

  const result = runEvidenceCheck(ventureDir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outcome PARK != canonical PROCEED/);
});

test('decision projection must preserve the complete decision snapshot', (t) => {
  const state = baseState();
  state.latest_decision = {
    id: 'D001',
    outcome: 'PROCEED',
    path: 'decisions/D001.md',
    snapshot: {
      next_action: state.next_action,
      blocking_assumptions: [],
      blocking_deferrals: [],
      do_not_build: [],
      revisit_when: [],
      reopen_combination_rule: null,
    },
  };
  const ventureDir = createVenture(t, state);
  const altered = structuredClone(state);
  altered.latest_decision.snapshot.next_action.instruction = 'A different instruction';
  fs.writeFileSync(path.join(ventureDir, 'decisions', 'D001.md'), decisionProjection(altered));

  const result = runEvidenceCheck(ventureDir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /decision snapshot differs/);
});

test('retired do-not-build and revisit IDs remain valid in historical decision snapshots', (t) => {
  const current = baseState();
  current.latest_decision = {
    id: 'D002',
    outcome: 'PROCEED',
    path: 'decisions/D002.md',
    snapshot: {
      next_action: structuredClone(current.next_action),
      blocking_assumptions: [],
      blocking_deferrals: [],
      do_not_build: [],
      revisit_when: [],
      reopen_combination_rule: null,
    },
  };

  const historical = structuredClone(current);
  historical.latest_decision = {
    id: 'D001',
    outcome: 'PARK',
    path: 'decisions/D001.md',
    snapshot: {
      next_action: structuredClone(current.next_action),
      blocking_assumptions: [],
      blocking_deferrals: [],
      do_not_build: [{ id: 'DNB001', statement: 'Do not build the integration yet.', evidence_ids: ['E001'] }],
      revisit_when: [{ id: 'T001', condition: 'New first-party demand evidence appears.', check: null }],
      reopen_combination_rule: { all_of: [], any_of: ['T001'], note: null },
    },
  };

  const ventureDir = createVenture(t, current);
  fs.writeFileSync(path.join(ventureDir, 'decisions', 'D001.md'), decisionProjection(historical));
  fs.writeFileSync(path.join(ventureDir, 'decisions', 'D002.md'), decisionProjection(current));

  const result = runEvidenceCheck(ventureDir);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('post-experiment learning may schedule a neutral re-decision after a TEST snapshot', (t) => {
  const state = baseState();
  state.stage = 'learning';
  state.blocking_assumptions = ['A001'];
  state.next_action = {
    id: 'N006',
    type: 'decision',
    assumption_id: null,
    instruction: 'Re-evaluate the venture after recording experiment results.',
    success_signal: null,
    failure_signal: null,
    depends_on: [],
  };
  state.latest_decision = {
    id: 'D001',
    outcome: 'TEST',
    path: 'decisions/D001.md',
    snapshot: {
      next_action: {
        id: 'N004',
        type: 'experiment',
        assumption_id: 'A001',
        instruction: 'Run the bounded experiment.',
        success_signal: 'Observed behavior supports A001.',
        failure_signal: 'Observed behavior contradicts A001.',
        depends_on: [],
      },
      blocking_assumptions: ['A001'],
      blocking_deferrals: [],
      do_not_build: [],
      revisit_when: [],
      reopen_combination_rule: null,
    },
  };

  const ventureDir = createVenture(t, state);
  fs.writeFileSync(path.join(ventureDir, 'decisions', 'D001.md'), decisionProjection(state));

  const result = runEvidenceCheck(ventureDir);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('historical guardrails cannot legitimize missing evidence references', (t) => {
  const current = baseState();
  current.latest_decision = {
    id: 'D002',
    outcome: 'PROCEED',
    path: 'decisions/D002.md',
    snapshot: {
      next_action: structuredClone(current.next_action),
      blocking_assumptions: [],
      blocking_deferrals: [],
      do_not_build: [],
      revisit_when: [],
      reopen_combination_rule: null,
    },
  };
  const historical = structuredClone(current);
  historical.latest_decision = {
    id: 'D001',
    outcome: 'PROCEED',
    path: 'decisions/D001.md',
    snapshot: {
      next_action: structuredClone(current.next_action),
      blocking_assumptions: [],
      blocking_deferrals: [],
      do_not_build: [{ id: 'DNB001', statement: 'Do not build yet.', evidence_ids: ['E999'] }],
      revisit_when: [],
      reopen_combination_rule: null,
    },
  };

  const ventureDir = createVenture(t, current);
  fs.writeFileSync(path.join(ventureDir, 'decisions', 'D001.md'), decisionProjection(historical));
  fs.writeFileSync(path.join(ventureDir, 'decisions', 'D002.md'), decisionProjection(current));
  fs.writeFileSync(path.join(ventureDir, 'research', 'current.md'), 'E999 supports the current recommendation.\n');

  const result = runEvidenceCheck(ventureDir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DNB001 references missing evidence E999/);
  assert.match(result.stderr, /current\.md references unknown ID E999/);
});

test('historical decision IDs must remain unique', (t) => {
  const state = baseState();
  state.latest_decision = {
    id: 'D001',
    outcome: 'PROCEED',
    path: 'decisions/D001-a.md',
    snapshot: {
      next_action: structuredClone(state.next_action),
      blocking_assumptions: [],
      blocking_deferrals: [],
      do_not_build: [],
      revisit_when: [],
      reopen_combination_rule: null,
    },
  };
  const ventureDir = createVenture(t, state);
  const projection = decisionProjection(state);
  fs.writeFileSync(path.join(ventureDir, 'decisions', 'D001-a.md'), projection);
  fs.writeFileSync(path.join(ventureDir, 'decisions', 'D001-b.md'), projection);

  const result = runEvidenceCheck(ventureDir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /duplicate decision ID D001/);
});

test('stable historical guardrail IDs cannot be reused with new meanings', (t) => {
  const state = baseState();
  state.do_not_build = [{ id: 'DNB001', statement: 'Do not build integrations.', evidence_ids: ['E001'] }];
  state.latest_decision = {
    id: 'D002',
    outcome: 'PROCEED',
    path: 'decisions/D002.md',
    snapshot: {
      next_action: structuredClone(state.next_action),
      blocking_assumptions: [],
      blocking_deferrals: [],
      do_not_build: structuredClone(state.do_not_build),
      revisit_when: [],
      reopen_combination_rule: null,
    },
  };
  const historical = structuredClone(state);
  historical.latest_decision = {
    id: 'D001',
    outcome: 'PROCEED',
    path: 'decisions/D001.md',
    snapshot: {
      next_action: structuredClone(state.next_action),
      blocking_assumptions: [],
      blocking_deferrals: [],
      do_not_build: [{ id: 'DNB001', statement: 'Do not build billing.', evidence_ids: ['E001'] }],
      revisit_when: [],
      reopen_combination_rule: null,
    },
  };
  const ventureDir = createVenture(t, state);
  fs.writeFileSync(path.join(ventureDir, 'decisions', 'D001.md'), decisionProjection(historical));
  fs.writeFileSync(path.join(ventureDir, 'decisions', 'D002.md'), decisionProjection(state));

  const result = runEvidenceCheck(ventureDir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DNB001 is reused with a different statement/);
});
