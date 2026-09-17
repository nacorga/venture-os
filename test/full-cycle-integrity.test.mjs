import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { fileURLToPath } from 'node:url';
import { parseDecisionProjection } from '../scripts/venture-utils.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runIntegrity(ventureDir) {
  return spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'check-venture-integrity.mjs'), ventureDir], {
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

function stateAtFirstDecision() {
  const nextAction = {
    id: 'N004',
    type: 'experiment',
    assumption_id: 'A001',
    instruction: 'Run a bounded behavioral willingness-to-pay test.',
    success_signal: 'At least two qualified buyers commit.',
    failure_signal: 'No qualified buyer commits.',
    depends_on: [],
  };
  return {
    version: 2,
    name: 'Full-cycle regression',
    slug: 'full-cycle-regression',
    stage: 'validation',
    thesis: {
      problem: 'The ICP experiences a costly recurring problem.',
      icp: 'A narrow professional segment',
      solution: 'A focused workflow tool',
      business_model: 'Subscription',
      distribution: 'Founder-led outreach',
    },
    assumptions: [{
      id: 'A001',
      statement: 'Qualified buyers will commit to paying for the proposed outcome.',
      category: 'willingness_to_pay',
      criticality: 'critical',
      status: 'supported',
      segment: 'primary-icp',
      evidence_ids: ['E001'],
    }],
    evidence_index: [{
      id: 'E001',
      type: 'first_party_qualitative',
      statement: 'Several qualified prospects describe the problem as urgent.',
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

test('contradictory evidence can change the next decision without rewriting the first', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'venture-os-full-cycle-'));
  const ventureDir = path.join(root, 'venture');
  for (const child of ['research', 'decisions', 'experiments', 'learning']) {
    fs.mkdirSync(path.join(ventureDir, child), { recursive: true });
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const first = stateAtFirstDecision();
  const firstDecisionSource = projection(first.latest_decision);
  fs.writeFileSync(path.join(ventureDir, 'venture.yaml'), YAML.stringify(first));
  fs.writeFileSync(path.join(ventureDir, 'decisions', 'D001.md'), firstDecisionSource);

  let check = runIntegrity(ventureDir);
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);

  const second = structuredClone(first);
  second.stage = 'learning';
  second.assumptions[0].status = 'mixed';
  second.assumptions[0].evidence_ids.push('E002');
  second.evidence_index.push({
    id: 'E002',
    type: 'first_party_behavioral',
    statement: 'Qualified prospects exposed to the paid offer did not commit.',
    source: null,
    observed_at: '2026-09-18',
    direction: 'contradicts',
    strength: 'strong',
    segment: 'primary-icp',
    transport_justification: null,
    assumption_ids: ['A001'],
  });
  second.blocking_assumptions = ['A001'];
  second.next_action = {
    id: 'N006',
    type: 'experiment',
    assumption_id: 'A001',
    instruction: 'Run one bounded follow-up test to distinguish price resistance from weak demand.',
    success_signal: 'The follow-up isolates a credible price-specific explanation.',
    failure_signal: 'Demand remains weak after the price-specific test.',
    depends_on: [],
  };
  second.latest_decision = {
    id: 'D002',
    outcome: 'TEST',
    path: 'decisions/D002.md',
    snapshot: {
      next_action: structuredClone(second.next_action),
      blocking_assumptions: ['A001'],
      blocking_deferrals: [],
      do_not_build: [],
      revisit_when: [],
      reopen_combination_rule: null,
    },
  };

  fs.writeFileSync(path.join(ventureDir, 'learning', 'contradictory-result.md'), '# Learning\n\nE002 contradicts A001 and changes the next gate.\n');
  fs.writeFileSync(path.join(ventureDir, 'venture.yaml'), YAML.stringify(second));
  fs.writeFileSync(path.join(ventureDir, 'decisions', 'D002.md'), projection(second.latest_decision));

  check = runIntegrity(ventureDir);
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  assert.equal(second.latest_decision.outcome, 'TEST');
  assert.equal(first.latest_decision.outcome, 'PROCEED');

  const preservedD001 = fs.readFileSync(path.join(ventureDir, 'decisions', 'D001.md'), 'utf8');
  assert.equal(preservedD001, firstDecisionSource);
  const parsedD001 = parseDecisionProjection(preservedD001);
  assert.equal(parsedD001.valid, true, parsedD001.errors.join('\n'));
  assert.equal(parsedD001.value.outcome, 'PROCEED');
  assert.deepEqual(parsedD001.value.snapshot, first.latest_decision.snapshot);
});
