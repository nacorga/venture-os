import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { comparedBehaviors } from '../scripts/eval-compare.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const caseId = 'inventory-monitoring-saas';

function runScript(scriptName, ...args) {
  return spawnSync(process.execPath, [path.join(repoRoot, 'scripts', scriptName), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function projection(decision, title) {
  return `${title}\n\n<!-- venture-state-projection:start -->\n${YAML.stringify({
    decision_id: decision.id,
    outcome: decision.outcome,
    snapshot: decision.snapshot,
  })}<!-- venture-state-projection:end -->\n`;
}

let runSequence = 0;

function frozenRun(t, { firstParty = false } = {}) {
  runSequence += 1;
  const created = runScript('new-eval-run.mjs', caseId, `test-model-${process.pid}-${runSequence}`);
  assert.equal(created.status, 0, created.stderr);
  const runId = created.stdout.match(/^Created evals\/runs\/(\S+)$/m)[1];
  const runDir = path.join(repoRoot, 'evals', 'runs', runId);
  t.after(() => fs.rmSync(runDir, { recursive: true, force: true }));

  const nextAction = { id: 'N004', type: 'positioning', assumption_id: null, instruction: 'Define positioning.', success_signal: null, failure_signal: null, depends_on: [] };
  const snapshot = { next_action: nextAction, blocking_assumptions: [], blocking_deferrals: [], do_not_build: [{ id: 'DNB001', statement: 'Do not build a dashboard.' }], revisit_when: [], reopen_combination_rule: null };
  const state = {
    version: 2,
    name: 'Compare fixture',
    slug: 'compare-fixture',
    stage: 'positioning',
    thesis: { problem: 'A problem', icp: 'An ICP', solution: 'A solution', business_model: 'Subscription', distribution: 'Outreach' },
    assumptions: [{ id: 'A001', statement: 'Stock-outs cost enough to pay for', category: 'problem', criticality: 'critical', status: 'mixed', evidence_ids: ['E001'] }],
    evidence_index: [{
      id: 'E001',
      type: firstParty ? 'first_party_qualitative' : 'secondary_external',
      statement: 'Retail stock-outs are costly.',
      source: 'https://example.com/report',
      direction: 'supports',
      strength: 'medium',
      assumption_ids: ['A001'],
    }],
    latest_decision: { id: 'D001', outcome: 'PROCEED', path: 'decisions/D001.md', snapshot },
    blocking_assumptions: [],
    blocking_deferrals: [],
    do_not_build: structuredClone(snapshot.do_not_build),
    next_action: structuredClone(nextAction),
    revisit_when: [],
    reopen_combination_rule: null,
  };
  fs.writeFileSync(path.join(runDir, 'venture', 'venture.yaml'), YAML.stringify(state));
  fs.writeFileSync(path.join(runDir, 'venture', 'decisions', 'D001.md'), projection(state.latest_decision, '# Decision D001'));
  fs.writeFileSync(path.join(runDir, 'venture', 'research', 'report.md'), '# Research\n\nThe TAM is large, which says nothing about demand.\n');
  fs.writeFileSync(path.join(runDir, 'RESULT.md'), projection(state.latest_decision, '# Result'));
  const freeze = runScript('freeze-eval-run.mjs', runId);
  assert.equal(freeze.status, 0, `${freeze.stdout}\n${freeze.stderr}`);
  return { runId, runDir };
}

function judgment(compareId, preference) {
  const preferences = comparedBehaviors.map(([key]) => `  ${key}: ${preference}`).join('\n');
  return `# Judgment\n\n<!-- venture-os-compare:start -->\ncompare: ${compareId}\njudge: judge-a\npreferences:\n${preferences}\noverall: ${preference}\n<!-- venture-os-compare:end -->\n`;
}

test('a blind comparison hides which run is which until it is unblinded', (t) => {
  const first = frozenRun(t);
  const second = frozenRun(t);

  const built = runScript('eval-compare.mjs', first.runId, second.runId);
  assert.equal(built.status, 0, built.stderr);
  const compareId = built.stdout.match(/^Created evals\/compare\/(\S+)$/m)[1];
  const compareDir = path.join(repoRoot, 'evals', 'compare', compareId);
  const keyPath = path.join(repoRoot, 'evals', 'compare', '.keys', `${compareId}.json`);
  t.after(() => {
    fs.rmSync(compareDir, { recursive: true, force: true });
    fs.rmSync(keyPath, { force: true });
  });

  for (const runId of [first.runId, second.runId]) assert.equal(built.stdout.includes(runId), false);
  const visible = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else visible.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(compareDir);
  for (const runId of [first.runId, second.runId]) assert.equal(visible.some((text) => text.includes(runId)), false, `${runId} leaks into the comparison`);
  for (const hidden of ['metadata.json', 'RUN.md', 'evaluator', 'scores', 'FROZEN.json']) {
    assert.equal(fs.existsSync(path.join(compareDir, 'X', hidden)), false, hidden);
  }

  fs.writeFileSync(path.join(compareDir, 'judgments', 'judge-a.md'), judgment(compareId, 'X'));
  const unblinded = runScript('eval-compare.mjs', '--unblind', compareId);
  assert.equal(unblinded.status, 0, unblinded.stderr);
  const result = JSON.parse(fs.readFileSync(path.join(compareDir, 'result.json'), 'utf8'));
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  assert.equal(result.overall[key.assignment.X], 1);
  assert.equal(result.judgments[0].preferences.alternatives, key.assignment.X);
  assert.equal(result.same_framework, true);
});

test('unblinding refuses a key that does not match its sealed commitment', (t) => {
  const first = frozenRun(t);
  const second = frozenRun(t);
  const built = runScript('eval-compare.mjs', first.runId, second.runId);
  const compareId = built.stdout.match(/^Created evals\/compare\/(\S+)$/m)[1];
  const compareDir = path.join(repoRoot, 'evals', 'compare', compareId);
  const keyPath = path.join(repoRoot, 'evals', 'compare', '.keys', `${compareId}.json`);
  t.after(() => {
    fs.rmSync(compareDir, { recursive: true, force: true });
    fs.rmSync(keyPath, { force: true });
  });

  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  key.assignment = { X: key.assignment.Y, Y: key.assignment.X };
  fs.writeFileSync(keyPath, JSON.stringify(key));
  fs.writeFileSync(path.join(compareDir, 'judgments', 'judge-a.md'), judgment(compareId, 'X'));
  const unblinded = runScript('eval-compare.mjs', '--unblind', compareId);
  assert.notEqual(unblinded.status, 0);
  assert.match(unblinded.stderr, /does not match its sealed commitment/);
});

test('a comparison needs two different frozen runs of one case', (t) => {
  const run = frozenRun(t);
  const self = runScript('eval-compare.mjs', run.runId, run.runId);
  assert.notEqual(self.status, 0);
  assert.match(self.stderr, /with itself/);
});

test('the fact sheet carries counts and alarms, and facts-only reveals no verdict', (t) => {
  const run = frozenRun(t, { firstParty: true });
  const facts = runScript('eval-verdict.mjs', run.runId, '--facts-only');
  assert.equal(facts.status, 0, facts.stderr);
  assert.doesNotMatch(facts.stdout, /PASS|FAIL|ordered|inverted/);
  assert.equal(fs.existsSync(path.join(run.runDir, 'scores', 'pairs.json')), false);
  const sheet = JSON.parse(fs.readFileSync(path.join(run.runDir, 'scores', 'facts.json'), 'utf8'));
  assert.equal(sheet.evidence.first_party, 1);
  assert.match(sheet.alarms[0], /first-party evidence record\(s\) with no first-party source in this run: E001/);
  assert.equal(sheet.market_size_vocabulary[0].file, 'venture/research/report.md');
  assert.equal(sheet.decision.do_not_build, 1);
  assert.equal(runScript('verify-eval-run.mjs', run.runId).status, 0);
});

function scoreFile(judge, scores) {
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  return `# Score\n\n<!-- venture-os-score:start -->\n${YAML.stringify({ rubric: 2, judge, scores, total })}<!-- venture-os-score:end -->\n`;
}

test('the summary aggregates judges and flags a disagreement wider than one point', (t) => {
  const run = frozenRun(t);
  const base = Object.fromEntries(comparedBehaviors.filter(([key]) => key !== 'decision_justification').map(([key]) => [key, 2]));
  fs.mkdirSync(path.join(run.runDir, 'scores'));
  fs.writeFileSync(path.join(run.runDir, 'scores', 'judge-a.md'), scoreFile('judge-a', base));
  fs.writeFileSync(path.join(run.runDir, 'scores', 'judge-b.md'), scoreFile('judge-b', { ...base, alternatives: 0 }));

  const summary = runScript('eval-summary.mjs', '--case', caseId);
  assert.equal(summary.status, 0, summary.stderr);
  const row = summary.stdout.split('\n').find((line) => line.startsWith(`| ${run.runId} |`));
  assert.match(row, /judge-a 16, judge-b 14/);
  assert.match(row, /\| alternatives \|$/);
});
