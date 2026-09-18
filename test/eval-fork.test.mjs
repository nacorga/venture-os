import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { runDigest, sha256Buffer as sha256 } from '../scripts/eval-provenance.mjs';

// The staged-reveal cycle end to end, with the model's work simulated as state
// edits: a frozen parent, a fork with a revealed packet, a second decision, a
// frozen child and a mechanical verdict.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const caseId = 'reveal-case';

function runScript(scriptName, ...args) {
  return spawnSync(process.execPath, [path.join(repoRoot, 'scripts', scriptName), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function readYaml(filePath) {
  return YAML.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeYaml(filePath, value) {
  fs.writeFileSync(filePath, YAML.stringify(value));
}

function projection(decision, title) {
  return `${title}\n\n<!-- venture-state-projection:start -->\n${YAML.stringify({
    decision_id: decision.id,
    outcome: decision.outcome,
    snapshot: decision.snapshot,
  })}<!-- venture-state-projection:end -->\n`;
}

const pair = {
  version: 1,
  id: 'P001',
  case: caseId,
  origin: 'Synthetic test pair.',
  arms: {
    a: {
      summary: 'Outreach to the target segment closed.',
      items: [
        { id: 'PK-1', text: 'Forty buyers in the segment were contacted.' },
        { id: 'PK-2', text: 'None agreed to a paid pilot.' },
      ],
    },
    b: {
      summary: 'Outreach to the target segment closed.',
      items: [
        { id: 'PK-1', text: 'Forty buyers in the segment were contacted.' },
        { id: 'PK-2', text: 'Nine signed a paid pilot and paid the deposit.' },
      ],
    },
  },
  expect: {
    order: 'a<b',
    a: { outcome_in: ['PARK', 'TEST'] },
    b: { outcome_not_in: ['PARK'] },
    traps: [{ arm: 'b', item: 'PK-2', max_strength: 'medium', origin: 'Nine of forty is a count from one outreach, not a rate that transfers.' }],
  },
};

function createSuite(t) {
  const suiteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'venture-os-reveal-suite-'));
  t.after(() => fs.rmSync(suiteRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(suiteRoot, 'cases', caseId), { recursive: true });
  fs.mkdirSync(path.join(suiteRoot, 'evals', 'reference', 'reveal', caseId), { recursive: true });
  writeYaml(path.join(suiteRoot, 'cases', caseId, 'case.yaml'), {
    schema_version: 1,
    id: caseId,
    title: 'Reveal test case',
    statement: 'A sufficiently detailed synthetic business statement for the staged reveal cycle.',
    categories: ['b2b-saas'],
    tags: ['testing'],
    provenance: { type: 'synthetic' },
  });
  fs.writeFileSync(path.join(suiteRoot, 'evals', 'reference', `${caseId}.yaml`), `name: ${caseId}\nexpected_uncertainties: []\nanti_patterns: []\n`);
  writeYaml(path.join(suiteRoot, 'evals', 'reference', 'reveal', caseId, 'P001.yaml'), pair);
  return suiteRoot;
}

const runsDir = path.join(repoRoot, 'evals', 'runs');

function trackRun(t, runId) {
  t.after(() => {
    fs.rmSync(path.join(runsDir, runId), { recursive: true, force: true });
    fs.rmSync(path.join(runsDir, '.keys', `${runId}.json`), { force: true });
  });
  return path.join(runsDir, runId);
}

function readKey(runId) {
  return JSON.parse(fs.readFileSync(path.join(runsDir, '.keys', `${runId}.json`), 'utf8'));
}

function writeKey(runId, key) {
  fs.writeFileSync(path.join(runsDir, '.keys', `${runId}.json`), JSON.stringify(key, null, 2) + '\n');
}

const noAction = { success_signal: null, failure_signal: null, depends_on: [] };

function parentState() {
  const decided = {
    id: 'N004',
    type: 'experiment',
    assumption_id: 'A001',
    instruction: 'Run a bounded paid-pilot test.',
    success_signal: 'At least two buyers pay.',
    failure_signal: 'No buyer pays.',
    depends_on: [],
  };
  const snapshot = {
    next_action: decided,
    blocking_assumptions: ['A001'],
    blocking_deferrals: [],
    do_not_build: [],
    revisit_when: [],
    reopen_combination_rule: null,
  };
  return {
    version: 2,
    name: 'Reveal fixture',
    slug: 'reveal-fixture',
    stage: 'experiment',
    thesis: { problem: 'A problem', icp: 'An ICP', solution: 'A solution', business_model: 'Subscription', distribution: 'Outreach' },
    assumptions: [{ id: 'A001', statement: 'Buyers will pay for a pilot', category: 'willingness_to_pay', criticality: 'critical', status: 'unknown', evidence_ids: ['E001'] }],
    evidence_index: [{
      id: 'E001',
      type: 'secondary_external',
      statement: 'Comparable tools sell pilots to this buyer.',
      source: 'https://example.com/pricing',
      direction: 'supports',
      strength: 'weak',
      assumption_ids: ['A001'],
    }],
    latest_decision: { id: 'D001', outcome: 'TEST', path: 'decisions/D001.md', snapshot },
    blocking_assumptions: ['A001'],
    blocking_deferrals: [],
    do_not_build: [],
    next_action: { id: 'N005', type: 'experiment', assumption_id: 'A001', experiment_id: 'X001', instruction: 'Execute X001.', ...noAction },
    revisit_when: [],
    reopen_combination_rule: null,
  };
}

function lockedExperiment() {
  const design = {
    primary_assumption_id: 'A001',
    target: { description: 'Primary ICP', sample_goal: 8 },
    procedure: ['Offer a paid pilot to eight named buyers'],
    assets: ['Offer'],
    budget: { max_days: 6, max_cash: 150, currency: 'EUR' },
    signals: {
      success: ['At least two buyers pay the deposit'],
      failure: ['No buyer pays the deposit', 'Every buyer declines before the offer'],
      ambiguous: ['Exactly one buyer pays'],
    },
    decision_rules: {
      on_success: { outcome: 'PROCEED', instruction: 'Advance to positioning.' },
      on_failure: { outcome: 'PARK', instruction: 'Park on first-party evidence; no second round.' },
      on_ambiguous: 'Park unless the payment is repeated.',
    },
  };
  return {
    version: 1,
    id: 'X001',
    name: 'Paid pilot test',
    status: 'designed',
    ...structuredClone(design),
    preregistration: { locked_at: '2026-09-18T08:00:00.000Z', design },
    results: { observations: [], evidence_ids: [], completed_at: null },
  };
}

let parentSequence = 0;

function createFrozenParent(t, suiteRoot) {
  parentSequence += 1;
  const created = runScript('new-eval-run.mjs', caseId, `test-model-${process.pid}-${parentSequence}`, '--suite', suiteRoot);
  assert.equal(created.status, 0, `${created.stdout}\n${created.stderr}`);
  const runId = created.stdout.match(/^Created evals\/runs\/(\S+)$/m)[1];
  const runDir = trackRun(t, runId);
  const state = parentState();
  writeYaml(path.join(runDir, 'venture', 'venture.yaml'), state);
  fs.writeFileSync(path.join(runDir, 'venture', 'decisions', 'D001.md'), projection(state.latest_decision, '# Decision D001'));
  fs.writeFileSync(path.join(runDir, 'RESULT.md'), projection(state.latest_decision, '# Result'));
  fs.writeFileSync(path.join(runDir, 'venture', 'research', 'desk.md'), '# Desk research\n\nNo buyer has been asked yet.\n');
  fs.mkdirSync(path.join(runDir, 'venture', 'experiments', 'X001-paid-pilot'), { recursive: true });
  writeYaml(path.join(runDir, 'venture', 'experiments', 'X001-paid-pilot', 'experiment.yaml'), lockedExperiment());
  const freeze = runScript('freeze-eval-run.mjs', runId, '--suite', suiteRoot);
  assert.equal(freeze.status, 0, `${freeze.stdout}\n${freeze.stderr}`);
  return { runId, runDir };
}

function fork(t, parentId, arm, ...extra) {
  const result = runScript('fork-eval-run.mjs', parentId, '--arm', arm, ...extra);
  const match = result.stdout.match(/^Created evals\/runs\/(\S+)$/m);
  if (match) trackRun(t, match[1]);
  return { result, runId: match?.[1], runDir: match ? path.join(repoRoot, 'evals', 'runs', match[1]) : null };
}

function secondSnapshot(outcome) {
  const base = { blocking_deferrals: [], do_not_build: [], reopen_combination_rule: null };
  if (outcome === 'PARK') {
    return { ...base, next_action: { id: 'N006', type: 'other', assumption_id: null, instruction: 'Stop until T001 holds.', ...noAction }, blocking_assumptions: [], revisit_when: [{ id: 'T001', condition: 'A buyer asks to pay unprompted.' }] };
  }
  if (outcome === 'TEST') {
    return { ...base, next_action: { id: 'N006', type: 'research', assumption_id: 'A001', instruction: 'Find out why buyers declined.', ...noAction }, blocking_assumptions: ['A001'], revisit_when: [] };
  }
  return { ...base, next_action: { id: 'N006', type: 'positioning', assumption_id: null, instruction: 'Define positioning.', ...noAction }, blocking_assumptions: [], revisit_when: [] };
}

function experimentFileFor(runDir, experimentId) {
  const experimentsDir = path.join(runDir, 'venture', 'experiments');
  for (const entry of fs.readdirSync(experimentsDir)) {
    const filePath = path.join(experimentsDir, entry, 'experiment.yaml');
    if (fs.existsSync(filePath) && readYaml(filePath).id === experimentId) return filePath;
  }
  throw new Error(`no experiment ${experimentId}`);
}

// Stands in for /eval-continue: cite the packet, record results, decide again.
// It reads only what the run under test may read.
function continueRun(runDir, { outcome, branch = null, strength = () => 'medium', skipItem = null, routingHeading = true }) {
  const venturePath = path.join(runDir, 'venture', 'venture.yaml');
  const state = readYaml(venturePath);
  const packet = readYaml(path.join(runDir, 'reveal', 'packet.yaml'));

  const evidenceIds = [];
  packet.items.forEach((item, index) => {
    if (item.id === skipItem) return;
    const id = `E${100 + index}`;
    evidenceIds.push(id);
    state.evidence_index.push({
      id,
      type: 'first_party_behavioral',
      statement: item.text,
      source: `reveal/packet.yaml#${item.id}`,
      observed_at: '2026-09-18',
      direction: 'contradicts',
      strength: strength(item.id),
      assumption_ids: ['A001'],
    });
  });
  state.assumptions[0].evidence_ids.push(...evidenceIds);

  if (packet.kind === 'prereg') {
    const experimentPath = experimentFileFor(runDir, packet.experiment_id);
    const experiment = readYaml(experimentPath);
    experiment.status = 'completed';
    experiment.results = {
      observations: packet.items.map((item) => item.text),
      evidence_ids: evidenceIds,
      completed_at: '2026-09-18T09:00:00.000Z',
      branch,
    };
    writeYaml(experimentPath, experiment);
  }

  const snapshot = secondSnapshot(outcome);
  state.latest_decision = { id: 'D002', outcome, path: 'decisions/D002.md', snapshot };
  state.stage = { PARK: 'parked', TEST: 'research', PROCEED: 'positioning' }[outcome];
  for (const key of Object.keys(snapshot)) state[key] = structuredClone(snapshot[key]);
  writeYaml(venturePath, state);

  const heading = routingHeading ? '\n## Pre-registered routing\n\nX001 fell in its failure branch.\n' : '';
  fs.writeFileSync(path.join(runDir, 'venture', 'decisions', 'D002.md'), projection(state.latest_decision, '# Decision D002') + heading);
  fs.writeFileSync(path.join(runDir, 'RESULT.md'), projection(state.latest_decision, '# Result'));
}

test('a preregistration fork reveals the run its own failure signal and is judged against its own rule', (t) => {
  const suiteRoot = createSuite(t);
  const parent = createFrozenParent(t, suiteRoot);

  const child = fork(t, parent.runId, 'prereg-failure', '--suite', suiteRoot);
  assert.equal(child.result.status, 0, `${child.result.stdout}\n${child.result.stderr}`);
  assert.match(child.runId, new RegExp(`^${parent.runId}--[0-9a-f]{8}$`));
  assert.equal(fs.existsSync(path.join(child.runDir, 'evaluator')), false);
  assert.equal(
    fs.readFileSync(path.join(child.runDir, 'RESULT.phase1.md'), 'utf8'),
    fs.readFileSync(path.join(parent.runDir, 'RESULT.md'), 'utf8'),
  );
  const packet = readYaml(path.join(child.runDir, 'reveal', 'packet.yaml'));
  assert.equal(packet.kind, 'prereg');
  assert.equal(packet.experiment_id, 'X001');
  assert.match(packet.items.map((item) => item.text).join('\n'), /"No buyer pays the deposit"/);
  assert.match(packet.items.map((item) => item.text).join('\n'), /"At least two buyers pay the deposit"/);

  // Nothing the run can read names its arm; the sealed key does.
  for (const file of ['metadata.json', 'RUN.md', 'reveal/packet.yaml']) {
    const text = fs.readFileSync(path.join(child.runDir, file), 'utf8');
    for (const label of ['prereg-failure', 'branch', suiteRoot]) assert.equal(text.includes(label), false, `${file} carries ${label}`);
  }
  const key = readKey(child.runId);
  assert.deepEqual([key.parent.run_id, key.parent.decision_id, key.reveal.arm, key.reveal.branch], [parent.runId, 'D001', 'prereg-failure', 'failure']);

  continueRun(child.runDir, { outcome: 'PARK', branch: 'failure' });
  const freeze = runScript('freeze-eval-run.mjs', child.runId, '--suite', suiteRoot);
  assert.equal(freeze.status, 0, `${freeze.stdout}\n${freeze.stderr}`);

  const verdict = runScript('eval-verdict.mjs', child.runId);
  assert.equal(verdict.status, 0, verdict.stderr);
  const mechanical = JSON.parse(fs.readFileSync(path.join(child.runDir, 'scores', 'mechanical.json'), 'utf8'));
  assert.equal(mechanical.pass, true, JSON.stringify(mechanical.checks));
  assert.equal(runScript('verify-eval-run.mjs', child.runId).status, 0);
});

test('a second decision that ignores its preregistered rule fails the verdict', (t) => {
  const suiteRoot = createSuite(t);
  const parent = createFrozenParent(t, suiteRoot);
  const child = fork(t, parent.runId, 'prereg-failure', '--suite', suiteRoot);
  continueRun(child.runDir, { outcome: 'TEST', branch: 'failure' });
  assert.equal(runScript('freeze-eval-run.mjs', child.runId, '--suite', suiteRoot).status, 0);

  runScript('eval-verdict.mjs', child.runId);
  const mechanical = JSON.parse(fs.readFileSync(path.join(child.runDir, 'scores', 'mechanical.json'), 'utf8'));
  assert.equal(mechanical.pass, false);
  const check = mechanical.checks.find((item) => item.check === 'outcome_follows_preregistration');
  assert.deepEqual([check.expected, check.actual, check.pass], ['PARK', 'TEST', false]);
});

for (const [name, tamper, message] of [
  ['a phase-1 decision edited after the fork', (runDir) => fs.appendFileSync(path.join(runDir, 'venture', 'decisions', 'D001.md'), '\nedited\n'), /phase-1 file venture\/decisions\/D001\.md changed/],
  ['an edited packet', (runDir) => fs.appendFileSync(path.join(runDir, 'reveal', 'packet.yaml'), '# edited\n'), /not the packet this fork was shown/],
  ['an edited phase-1 result', (runDir) => fs.appendFileSync(path.join(runDir, 'RESULT.phase1.md'), '\nedited\n'), /RESULT\.phase1\.md is not the parent's RESULT\.md/],
  ['an edited phase-1 research note', (runDir) => fs.appendFileSync(path.join(runDir, 'venture', 'research', 'desk.md'), '\nedited\n'), /phase-1 file venture\/research\/desk\.md changed/],
  ['a rewritten phase-1 evidence record', (runDir) => {
    const venturePath = path.join(runDir, 'venture', 'venture.yaml');
    const state = readYaml(venturePath);
    state.evidence_index[0].strength = 'strong';
    writeYaml(venturePath, state);
  }, /phase-1 evidence E001 was rewritten/],
  ['a phase-1 assumption that now asserts something else', (runDir) => {
    const venturePath = path.join(runDir, 'venture', 'venture.yaml');
    const state = readYaml(venturePath);
    state.assumptions[0].statement = 'Buyers will pay for anything';
    writeYaml(venturePath, state);
  }, /phase-1 assumption A001 now asserts something else/],
  ['a rewritten preregistration', (runDir) => {
    const experimentPath = experimentFileFor(runDir, 'X001');
    const experiment = readYaml(experimentPath);
    experiment.preregistration.locked_at = '2026-09-18T09:30:00.000Z';
    writeYaml(experimentPath, experiment);
  }, /the preregistration of X001 changed after the fork/],
  ['a packet edited together with the hash in its key', (runDir, runId) => {
    const packetPath = path.join(runDir, 'reveal', 'packet.yaml');
    const packet = readYaml(packetPath);
    packet.items[4].text = 'Every participant paid the deposit.';
    writeYaml(packetPath, packet);
    const key = readKey(runId);
    key.reveal.packet_sha256 = sha256(fs.readFileSync(packetPath));
    writeKey(runId, key);
  }, /not the packet this fork was shown/],
  ['its key deleted', (runDir, runId) => fs.rmSync(path.join(runsDir, '.keys', `${runId}.json`)), /carries a revealed packet or a phase-1 result but has no fork key/],
]) {
  test(`freeze refuses a fork with ${name}`, (t) => {
    const suiteRoot = createSuite(t);
    const parent = createFrozenParent(t, suiteRoot);
    const child = fork(t, parent.runId, 'prereg-failure', '--suite', suiteRoot);
    continueRun(child.runDir, { outcome: 'PARK', branch: 'failure' });
    tamper(child.runDir, child.runId);
    const freeze = runScript('freeze-eval-run.mjs', child.runId, '--suite', suiteRoot);
    assert.notEqual(freeze.status, 0);
    assert.match(freeze.stderr, message);
  });
}

test('an experiment re-serialised with its keys reordered still freezes', (t) => {
  const suiteRoot = createSuite(t);
  const parent = createFrozenParent(t, suiteRoot);
  const child = fork(t, parent.runId, 'prereg-failure', '--suite', suiteRoot);
  continueRun(child.runDir, { outcome: 'PARK', branch: 'failure' });
  const experimentPath = experimentFileFor(child.runDir, 'X001');
  const sortKeys = (value) => (Array.isArray(value)
    ? value.map(sortKeys)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]))
      : value);
  writeYaml(experimentPath, sortKeys(readYaml(experimentPath)));
  const freeze = runScript('freeze-eval-run.mjs', child.runId, '--suite', suiteRoot);
  assert.equal(freeze.status, 0, `${freeze.stdout}\n${freeze.stderr}`);
});

test('freeze refuses a fork with an uncited packet item', (t) => {
  const suiteRoot = createSuite(t);
  const parent = createFrozenParent(t, suiteRoot);
  const child = fork(t, parent.runId, 'prereg-failure', '--suite', suiteRoot);
  continueRun(child.runDir, { outcome: 'PARK', branch: 'failure', skipItem: 'PK-5' });
  const freeze = runScript('freeze-eval-run.mjs', child.runId, '--suite', suiteRoot);
  assert.notEqual(freeze.status, 0);
  assert.match(freeze.stderr, /packet item PK-5 is cited by no evidence record/);
});

test('freeze refuses a fork that made no new decision', (t) => {
  const suiteRoot = createSuite(t);
  const parent = createFrozenParent(t, suiteRoot);
  const child = fork(t, parent.runId, 'prereg-failure', '--suite', suiteRoot);
  fs.copyFileSync(path.join(child.runDir, 'RESULT.phase1.md'), path.join(child.runDir, 'RESULT.md'));
  const freeze = runScript('freeze-eval-run.mjs', child.runId, '--suite', suiteRoot);
  assert.notEqual(freeze.status, 0);
  assert.match(freeze.stderr, /no decision was made after the reveal/);
});

test('only a verified frozen run can be forked', (t) => {
  const suiteRoot = createSuite(t);
  const created = runScript('new-eval-run.mjs', caseId, 'test-model', '--suite', suiteRoot);
  const runId = created.stdout.match(/^Created evals\/runs\/(\S+)$/m)[1];
  trackRun(t, runId);
  const child = fork(t, runId, 'prereg-failure', '--suite', suiteRoot);
  assert.notEqual(child.result.status, 0);
  assert.match(child.result.stderr, /not a verified frozen run/);
});

test('a fork on a different framework needs --cross-framework', (t) => {
  const suiteRoot = createSuite(t);
  const parent = createFrozenParent(t, suiteRoot);
  // Simulate a parent frozen under another framework, keeping it verifiable.
  const provenancePath = path.join(parent.runDir, 'evaluator', 'PROVENANCE.json');
  const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
  provenance.framework_sha256 = '0'.repeat(64);
  fs.writeFileSync(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
  const markerPath = path.join(parent.runDir, 'FROZEN.json');
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  Object.assign(marker, runDigest(parent.runDir), { framework_sha256: '0'.repeat(64) });
  fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n');
  assert.equal(runScript('verify-eval-run.mjs', parent.runId).status, 0);

  const refused = fork(t, parent.runId, 'prereg-failure', '--suite', suiteRoot);
  assert.notEqual(refused.result.status, 0);
  assert.match(refused.result.stderr, /Pass --cross-framework/);

  const crossed = fork(t, parent.runId, 'prereg-failure', '--suite', suiteRoot, '--cross-framework');
  assert.equal(crossed.result.status, 0, crossed.result.stderr);
  assert.equal(readKey(crossed.runId).reveal.cross_framework, true);
});

test('planted pair arms reveal only their own evidence and are judged as a pair', (t) => {
  const suiteRoot = createSuite(t);
  const parent = createFrozenParent(t, suiteRoot);

  const withoutSuite = fork(t, parent.runId, 'P001-a');
  assert.notEqual(withoutSuite.result.status, 0);
  assert.match(withoutSuite.result.stderr, /pass --suite/);

  const a = fork(t, parent.runId, 'P001-a', '--suite', suiteRoot);
  const b = fork(t, parent.runId, 'P001-b', '--suite', suiteRoot);
  assert.equal(a.result.status, 0, a.result.stderr);
  assert.equal(b.result.status, 0, b.result.stderr);
  const packetText = fs.readFileSync(path.join(a.runDir, 'reveal', 'packet.yaml'), 'utf8');
  assert.match(packetText, /None agreed to a paid pilot/);
  for (const hidden of ['Nine signed', 'expect', 'origin', 'max_strength', 'P001']) assert.equal(packetText.includes(hidden), false, hidden);
  const metadataText = fs.readFileSync(path.join(a.runDir, 'metadata.json'), 'utf8');
  assert.equal(metadataText.includes('P001'), false);

  continueRun(a.runDir, { outcome: 'PARK' });
  continueRun(b.runDir, { outcome: 'PROCEED', strength: (item) => (item === 'PK-2' ? 'strong' : 'medium') });
  for (const child of [a, b]) {
    const freeze = runScript('freeze-eval-run.mjs', child.runId, '--suite', suiteRoot);
    assert.equal(freeze.status, 0, `${freeze.stdout}\n${freeze.stderr}`);
    assert.equal(fs.existsSync(path.join(child.runDir, 'evaluator', 'reveal-pair.yaml')), true);
    runScript('eval-verdict.mjs', child.runId);
  }

  const verdictA = JSON.parse(fs.readFileSync(path.join(a.runDir, 'scores', 'mechanical.json'), 'utf8'));
  assert.equal(verdictA.pass, true, JSON.stringify(verdictA.checks));
  const verdictB = JSON.parse(fs.readFileSync(path.join(b.runDir, 'scores', 'mechanical.json'), 'utf8'));
  const trap = verdictB.checks.find((item) => item.check === 'trap');
  assert.equal(trap.pass, false);
  assert.match(trap.failures[0], /is strong, above medium/);

  const pairVerdict = runScript('eval-verdict.mjs', parent.runId);
  assert.equal(pairVerdict.status, 0, pairVerdict.stderr);
  const pairs = JSON.parse(fs.readFileSync(path.join(parent.runDir, 'scores', 'pairs.json'), 'utf8')).pairs;
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].result, 'ordered');
  assert.equal(runScript('verify-eval-run.mjs', parent.runId).status, 0);
});

test('forks of different versions of one pair are never paired', (t) => {
  const suiteRoot = createSuite(t);
  const parent = createFrozenParent(t, suiteRoot);
  const a = fork(t, parent.runId, 'P001-a', '--suite', suiteRoot);
  continueRun(a.runDir, { outcome: 'PARK' });
  assert.equal(runScript('freeze-eval-run.mjs', a.runId, '--suite', suiteRoot).status, 0);

  const edited = structuredClone(pair);
  edited.arms.b.items[1].text = 'Twelve signed a paid pilot and paid the deposit.';
  edited.expect.order = 'a>b';
  writeYaml(path.join(suiteRoot, 'evals', 'reference', 'reveal', caseId, 'P001.yaml'), edited);
  const b = fork(t, parent.runId, 'P001-b', '--suite', suiteRoot);
  continueRun(b.runDir, { outcome: 'PROCEED' });
  assert.equal(runScript('freeze-eval-run.mjs', b.runId, '--suite', suiteRoot).status, 0);

  assert.equal(runScript('eval-verdict.mjs', parent.runId).status, 0);
  const pairs = JSON.parse(fs.readFileSync(path.join(parent.runDir, 'scores', 'pairs.json'), 'utf8')).pairs;
  assert.deepEqual(pairs, []);
});

test('a pair verdict finds forks by their key, not by a name that happens to share a prefix', (t) => {
  const suiteRoot = createSuite(t);
  const first = createFrozenParent(t, suiteRoot);
  const second = createFrozenParent(t, suiteRoot);
  const a = fork(t, first.runId, 'P001-a', '--suite', suiteRoot);
  const b = fork(t, second.runId, 'P001-b', '--suite', suiteRoot);
  continueRun(a.runDir, { outcome: 'PARK' });
  continueRun(b.runDir, { outcome: 'PROCEED' });
  assert.equal(runScript('freeze-eval-run.mjs', a.runId, '--suite', suiteRoot).status, 0);
  assert.equal(runScript('freeze-eval-run.mjs', b.runId, '--suite', suiteRoot).status, 0);

  // Give the second parent's fork a name under the first parent's prefix.
  const disguised = `${first.runId}--deadbeef`;
  trackRun(t, disguised);
  fs.renameSync(b.runDir, path.join(runsDir, disguised));
  const key = readKey(b.runId);
  key.fork_id = disguised;
  writeKey(disguised, key);
  fs.rmSync(path.join(runsDir, '.keys', `${b.runId}.json`));

  assert.equal(runScript('eval-verdict.mjs', first.runId).status, 0);
  const pairs = JSON.parse(fs.readFileSync(path.join(first.runDir, 'scores', 'pairs.json'), 'utf8')).pairs;
  assert.deepEqual(pairs, []);
});
