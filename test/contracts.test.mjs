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
  runtimePaths,
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

test('scores/ remains outside the frozen artifact hash', (t) => {
  const { runId, runDir } = createEvalRun(t);
  const freeze = runScript('freeze-eval-run.mjs', runId);
  assert.equal(freeze.status, 0, `${freeze.stdout}\n${freeze.stderr}`);

  fs.mkdirSync(path.join(runDir, 'scores'));
  fs.writeFileSync(path.join(runDir, 'scores', 'judge-a.md'), '# Score\n');
  fs.writeFileSync(path.join(runDir, 'scores', 'judge-b.md'), '# Score\n');
  const verify = runScript('verify-eval-run.mjs', runId);
  assert.equal(verify.status, 0, verify.stderr);
});

test('freeze refuses a run that already has scores', (t) => {
  const { runId, runDir } = createEvalRun(t);
  fs.mkdirSync(path.join(runDir, 'scores'));
  fs.writeFileSync(path.join(runDir, 'scores', 'early.md'), '# Score\n');

  const freeze = runScript('freeze-eval-run.mjs', runId);
  assert.notEqual(freeze.status, 0);
  assert.match(freeze.stderr, /scores\/ already exists before freeze/);
});

function writeCompletedVenture(runDir, state) {
  const ventureDir = path.join(runDir, 'venture');
  fs.writeFileSync(path.join(ventureDir, 'venture.yaml'), YAML.stringify(state));
  fs.writeFileSync(path.join(ventureDir, 'decisions', 'D001.md'), decisionProjection(state));
  fs.writeFileSync(path.join(runDir, 'RESULT.md'), decisionProjection(state, '# Result'));
}

test('an external suite supplies the case and reference without its path reaching the run', (t) => {
  const suiteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'venture-os-suite-'));
  t.after(() => fs.rmSync(suiteRoot, { recursive: true, force: true }));
  const caseId = 'private-case';
  fs.mkdirSync(path.join(suiteRoot, 'cases', caseId), { recursive: true });
  fs.mkdirSync(path.join(suiteRoot, 'evals', 'reference'), { recursive: true });
  fs.writeFileSync(path.join(suiteRoot, 'cases', caseId, 'case.yaml'), YAML.stringify(validCase({ id: caseId })));
  const referencePath = path.join(suiteRoot, 'evals', 'reference', `${caseId}.yaml`);
  fs.writeFileSync(referencePath, 'name: private-case\nexpected_uncertainties: []\nanti_patterns: []\n');

  const created = runScript('new-eval-run.mjs', caseId, 'test-model', '--suite', suiteRoot);
  assert.equal(created.status, 0, `${created.stdout}\n${created.stderr}`);
  const runId = created.stdout.match(/^Created evals\/runs\/(\S+)$/m)[1];
  const runDir = path.join(repoRoot, 'evals', 'runs', runId);
  t.after(() => fs.rmSync(runDir, { recursive: true, force: true }));

  const metadataText = fs.readFileSync(path.join(runDir, 'metadata.json'), 'utf8');
  assert.equal(JSON.parse(metadataText).suite.label, path.basename(suiteRoot));
  assert.equal(metadataText.includes(suiteRoot), false);
  assert.equal(fs.readFileSync(path.join(runDir, 'RUN.md'), 'utf8').includes(suiteRoot), false);

  writeCompletedVenture(runDir, validEvalState('suite-eval'));

  const withoutSuite = runScript('freeze-eval-run.mjs', runId);
  assert.notEqual(withoutSuite.status, 0);
  assert.match(withoutSuite.stderr, /created from suite .*pass --suite/);

  const freeze = runScript('freeze-eval-run.mjs', runId, '--suite', suiteRoot);
  assert.equal(freeze.status, 0, `${freeze.stdout}\n${freeze.stderr}`);
  assert.equal(
    fs.readFileSync(path.join(runDir, 'evaluator', 'reference.yaml'), 'utf8'),
    fs.readFileSync(referencePath, 'utf8'),
  );
  const verify = runScript('verify-eval-run.mjs', runId);
  assert.equal(verify.status, 0, verify.stderr);
});

test('a suite case must live in a directory named by its id', (t) => {
  const suiteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'venture-os-suite-'));
  t.after(() => fs.rmSync(suiteRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(suiteRoot, 'cases', 'wrong-dir'), { recursive: true });
  fs.writeFileSync(path.join(suiteRoot, 'cases', 'wrong-dir', 'case.yaml'), YAML.stringify(validCase({ id: 'other-id' })));

  const created = runScript('new-eval-run.mjs', 'wrong-dir', 'test-model', '--suite', suiteRoot);
  assert.notEqual(created.status, 0);
  assert.match(created.stderr, /must match directory name 'wrong-dir'/);
});

function testDecisionState() {
  const state = validEvalState('test-decision');
  state.assumptions = [{
    id: 'A001',
    statement: 'Buyers will commit to the outcome',
    category: 'willingness_to_pay',
    criticality: 'critical',
    status: 'unknown',
    evidence_ids: [],
  }];
  const decided = {
    id: 'N004',
    type: 'experiment',
    assumption_id: 'A001',
    instruction: 'Run a bounded commitment test.',
    success_signal: 'At least two buyers commit.',
    failure_signal: 'No buyer commits.',
    depends_on: [],
  };
  state.latest_decision.outcome = 'TEST';
  state.latest_decision.snapshot.next_action = structuredClone(decided);
  state.latest_decision.snapshot.blocking_assumptions = ['A001'];
  state.blocking_assumptions = ['A001'];
  state.next_action = structuredClone(decided);
  return state;
}

function lockedExperiment() {
  const design = {
    primary_assumption_id: 'A001',
    target: { description: 'Primary ICP', sample_goal: 5 },
    procedure: ['Offer a paid pilot'],
    assets: ['Offer'],
    budget: { max_days: 5, max_cash: 0, currency: 'EUR' },
    signals: {
      success: ['At least two buyers commit'],
      failure: ['No buyer commits'],
      ambiguous: ['Exactly one buyer commits'],
    },
    decision_rules: {
      on_success: { outcome: 'PROCEED', instruction: 'Advance to positioning.' },
      on_failure: { outcome: 'PARK', instruction: 'Park on first-party evidence.' },
      on_ambiguous: 'Park unless the one commitment is a paid one.',
    },
  };
  return {
    version: 1,
    id: 'X001',
    name: 'Commitment test',
    status: 'designed',
    ...structuredClone(design),
    preregistration: { locked_at: '2026-09-18T08:00:00.000Z', design },
    results: { observations: [], evidence_ids: [], completed_at: null },
  };
}

test('a decision to experiment cannot freeze without a locked, outcome-routed experiment', (t) => {
  const { runId, runDir } = createEvalRun(t);
  writeCompletedVenture(runDir, testDecisionState());

  const freeze = runScript('freeze-eval-run.mjs', runId);
  assert.notEqual(freeze.status, 0);
  assert.match(freeze.stderr, /decides an experiment on A001, but no locked experiment/);
});

test('a decision to experiment freezes once its experiment is locked with routed outcomes', (t) => {
  const { runId, runDir } = createEvalRun(t);
  const state = testDecisionState();
  state.stage = 'experiment';
  state.next_action = {
    id: 'N005',
    type: 'experiment',
    assumption_id: 'A001',
    experiment_id: 'X001',
    instruction: 'Execute X001.',
    success_signal: null,
    failure_signal: null,
    depends_on: [],
  };
  writeCompletedVenture(runDir, state);
  const experimentDir = path.join(runDir, 'venture', 'experiments', 'X001-commitment');
  fs.mkdirSync(experimentDir, { recursive: true });
  fs.writeFileSync(path.join(experimentDir, 'experiment.yaml'), YAML.stringify(lockedExperiment()));

  const freeze = runScript('freeze-eval-run.mjs', runId);
  assert.equal(freeze.status, 0, `${freeze.stdout}\n${freeze.stderr}`);
});

test('every module a runtime script imports is itself hashed into the runtime', () => {
  const hashed = new Set(runtimePaths);
  for (const entry of runtimePaths.filter((item) => item.endsWith('.mjs'))) {
    const source = fs.readFileSync(path.join(repoRoot, entry), 'utf8');
    for (const [, specifier] of source.matchAll(/from '(\.\/[^']+)'/g)) {
      const imported = path.posix.join(path.posix.dirname(entry), specifier);
      assert.ok(hashed.has(imported), `${entry} imports ${imported}, which runtimePaths does not hash`);
    }
  }
});
