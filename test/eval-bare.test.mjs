import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pairResult, parseDecision } from '../scripts/eval-bare.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Stands in for the Claude Code CLI with no project loaded. It records where
// and how it was started, and answers PARK to evidence of weak uptake and TEST
// otherwise, so a pair's order follows the packet it was shown.
const fakeClaude = `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
const option = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const prompt = option('-p');
fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ cwd: process.cwd(), resume: option('--resume'), fork: args.includes('--fork-session'), skills: fs.existsSync('.claude') }) + '\\n');
const emit = (event) => process.stdout.write(JSON.stringify(event) + '\\n');
emit({ type: 'system', subtype: 'init', session_id: 'session-' + Math.random().toString(16).slice(2), model: option('--model'), permissionMode: option('--permission-mode'), skills: ['debug'], agents: ['Explore'], plugins: [], mcp_servers: [] });
const decision = prompt.includes('One of the 12 paid') ? 'PARK' : 'TEST';
emit({ type: 'result', subtype: 'success', is_error: false, num_turns: 2, total_cost_usd: 0.5, modelUsage: {}, permission_denials: [], result: 'Reasoning.\\n\\nDECISION: ' + decision });
`;

test('a decision is the last DECISION line, bold or not', () => {
  assert.equal(parseDecision('I considered DECISION: PROCEED earlier.\n\n**DECISION: PARK**'), 'PARK');
  assert.equal(parseDecision('DECISION:TEST'), 'TEST');
  assert.equal(parseDecision('No verdict here.'), null);
});

test('a plain pair is scored on its expectations and its order', () => {
  const expect = { order: 'a<b', a: { outcome_not_in: ['PROCEED'] } };
  assert.deepEqual(pairResult(expect, { a: 'PARK', b: 'TEST' }).order, 'ordered');
  assert.equal(pairResult(expect, { a: 'TEST', b: 'TEST' }).order, 'tied');
  assert.equal(pairResult(expect, { a: 'TEST', b: 'TEST' }).pass, true);
  assert.equal(pairResult(expect, { a: 'PROCEED', b: 'TEST' }).pass, false);
  assert.equal(pairResult(expect, { a: 'TEST', b: 'PARK' }).order, 'inverted');
});

test('Claude without Venture OS answers the case, then each arm from a copy of that session', (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'venture-os-bare-test-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const claude = path.join(scratch, 'claude.mjs');
  fs.writeFileSync(claude, fakeClaude, { mode: 0o755 });
  const log = path.join(scratch, 'log.jsonl');
  const before = new Set(fs.existsSync(path.join(repoRoot, 'evals', 'bare')) ? fs.readdirSync(path.join(repoRoot, 'evals', 'bare')) : []);

  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'eval-bare.mjs'), 'inventory-monitoring-saas', '--model', 'fake-model', '--effort', 'low', '--claude', claude], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, FAKE_CLAUDE_LOG: log },
  });
  const created = fs.readdirSync(path.join(repoRoot, 'evals', 'bare')).filter((name) => !before.has(name));
  t.after(() => { for (const name of created) fs.rmSync(path.join(repoRoot, 'evals', 'bare', name), { recursive: true, force: true }); });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const starts = fs.readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(starts.length, 3);
  for (const start of starts) {
    assert.equal(start.cwd.startsWith(fs.realpathSync(repoRoot)), false, 'a plain session runs outside this checkout');
    assert.equal(start.skills, false);
  }
  assert.equal(starts[0].resume, null);
  assert.ok(starts[1].resume && starts[1].fork && starts[2].resume === starts[1].resume, 'both arms continue a copy of the first session');

  const record = JSON.parse(fs.readFileSync(path.join(repoRoot, 'evals', 'bare', created[0], 'result.json'), 'utf8'));
  assert.deepEqual([record.phases.first.decision, record.phases.a.decision, record.phases.b.decision], ['TEST', 'PARK', 'TEST']);
  assert.equal(record.verdict.order, 'ordered');
  assert.equal(record.verdict.pass, true);
  assert.equal(record.total_cost_usd, 1.5);

  const summary = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'eval-summary.mjs'), '--case', 'inventory-monitoring-saas'], { cwd: repoRoot, encoding: 'utf8' });
  assert.match(summary.stdout, /## Against plain Claude[\s\S]*\| inventory-monitoring-saas \| P001 \| 1 \| fake-model \| TEST → PARK · TEST \| ordered \| PASS \| 1\.50 \|/);
});
