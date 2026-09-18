import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { sessionConfiguration } from '../scripts/eval-batch.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runsDir = path.join(repoRoot, 'evals', 'runs');
const caseId = 'inventory-monitoring-saas';

// Stands in for the Claude Code CLI: records how it was started, reports the
// project it was asked to load, does what the prompt's skill would leave behind,
// and ends with two results, the way a session with background agents does.
// FAKE_* variables make it misbehave in the ways the runner must survive.
const fakeClaude = `#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const prompt = option('-p');
if (process.env.FAKE_CLAUDE_LOG) {
  fs.writeFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({
    args,
    env: {
      CLAUDECODE: process.env.CLAUDECODE ?? null,
      CLAUDE_EFFORT: process.env.CLAUDE_EFFORT ?? null,
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY ?? null,
    },
  }));
}
if (process.env.FAKE_IGNORE_TERM) process.on('SIGTERM', () => {});
const emit = (event) => process.stdout.write(JSON.stringify(event) + '\\n');
const root = process.cwd();
const skills = fs.readdirSync(path.join(root, '.claude', 'skills'));
const agents = fs.readdirSync(path.join(root, '.claude', 'agents')).map((name) => name.replace(/\\.md$/, ''))
  .filter((agent) => agent !== process.env.FAKE_DROP_AGENT);
emit({ type: 'system', subtype: 'init', session_id: 'fake-session', claude_code_version: 'fake', apiKeySource: 'none',
  model: option('--model'), permissionMode: option('--permission-mode'),
  skills: [...skills, 'debug'], agents: [...agents, 'Explore'], plugins: [], mcp_servers: [] });
if (process.env.FAKE_DROP_AGENT) await new Promise((resolve) => setTimeout(resolve, 30000));
const [command, id, judge] = prompt.split(' ');
const runDir = path.join(root, 'evals', 'runs', id);
if (['/eval-run', '/eval-continue'].includes(command) && process.env.FAKE_FIXTURE) fs.cpSync(process.env.FAKE_FIXTURE, runDir, { recursive: true });
if (process.env.FAKE_SELF_FREEZE) execFileSync(process.execPath, [path.join(root, 'scripts', 'freeze-eval-run.mjs'), id]);
if (command === '/eval-score') {
  fs.writeFileSync(path.join(runDir, 'scores', judge + '.md'), '# Score\\n');
  if (process.env.FAKE_TAMPER) fs.writeFileSync(path.join(runDir, 'scores', 'judge-b.md'), '# Rewritten\\n');
}
if (command === '/eval-compare') fs.writeFileSync(path.join(root, 'evals', 'compare', id, 'judgments', judge + '.md'), '# Judgment\\n');
if (process.env.FAKE_ORPHAN) spawn('sleep', ['20'], { stdio: ['ignore', 'inherit', 'ignore'], detached: true }).unref();
emit({ type: 'result', subtype: 'success', is_error: false, num_turns: 3, total_cost_usd: 1, modelUsage: { fake: { costUSD: 1 } }, permission_denials: [] });
emit({ type: 'system', subtype: 'permission_denied', tool_name: 'Bash', tool_use_id: 't1', message: 'This command requires approval' });
const failed = Boolean(process.env.FAKE_RESULT_ERROR || process.env.FAKE_SELF_FREEZE);
emit({ type: 'result', subtype: failed ? 'error_during_execution' : 'success', is_error: failed, num_turns: 5, total_cost_usd: 2.5,
  modelUsage: { fake: { costUSD: 2.5 } }, permission_denials: [{ tool_name: 'Bash', tool_use_id: 't1', tool_input: { command: 'curl https://example.com' } }] });
`;

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'venture-os-batch-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const claude = path.join(dir, 'claude.mjs');
  fs.writeFileSync(claude, fakeClaude, { mode: 0o755 });
  return { dir, claude, log: path.join(dir, 'claude-log.json') };
}

function runScript(scriptName, args, env = {}) {
  return spawnSync(process.execPath, [path.join(repoRoot, 'scripts', scriptName), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function batch(fake, args, env = {}) {
  return runScript('eval-batch.mjs', [...args, '--model', 'fake-model', '--effort', 'high', '--claude', fake.claude], {
    CLAUDECODE: '1',
    CLAUDE_EFFORT: 'max',
    FAKE_CLAUDE_LOG: fake.log,
    ...env,
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function startedWith(fake) {
  const { args } = readJson(fake.log);
  return {
    option: (name) => args[args.indexOf(name) + 1],
    allowed: args.slice(args.indexOf('--allowedTools') + 1),
    args,
  };
}

let runSequence = 0;

function newRun(t) {
  runSequence += 1;
  const created = runScript('new-eval-run.mjs', [caseId, `batch-model-${process.pid}-${runSequence}`]);
  assert.equal(created.status, 0, created.stderr);
  const runId = created.stdout.match(/^Created evals\/runs\/(\S+)$/m)[1];
  const runDir = path.join(runsDir, runId);
  t.after(() => fs.rmSync(runDir, { recursive: true, force: true }));
  return { runId, runDir };
}

function projection(decision, title) {
  return `${title}\n\n<!-- venture-state-projection:start -->\n${YAML.stringify({
    decision_id: decision.id,
    outcome: decision.outcome,
    snapshot: decision.snapshot,
  })}<!-- venture-state-projection:end -->\n`;
}

// What a completed first phase leaves in its run directory.
function completedRunFixture(dir) {
  const fixture = path.join(dir, 'fixture');
  const nextAction = { id: 'N004', type: 'positioning', assumption_id: null, instruction: 'Define positioning.', success_signal: null, failure_signal: null, depends_on: [] };
  const snapshot = { next_action: nextAction, blocking_assumptions: [], blocking_deferrals: [], do_not_build: [{ id: 'DNB001', statement: 'Do not build a dashboard.' }], revisit_when: [], reopen_combination_rule: null };
  const state = {
    version: 2,
    name: 'Batch fixture',
    slug: 'batch-fixture',
    stage: 'positioning',
    thesis: { problem: 'A problem', icp: 'An ICP', solution: 'A solution', business_model: 'Subscription', distribution: 'Outreach' },
    assumptions: [{ id: 'A001', statement: 'Stock-outs cost enough to pay for', category: 'problem', criticality: 'critical', status: 'mixed', evidence_ids: ['E001'] }],
    evidence_index: [{ id: 'E001', type: 'secondary_external', statement: 'Retail stock-outs are costly.', source: 'https://example.com/report', direction: 'supports', strength: 'medium', assumption_ids: ['A001'] }],
    latest_decision: { id: 'D001', outcome: 'PROCEED', path: 'decisions/D001.md', snapshot },
    blocking_assumptions: [],
    blocking_deferrals: [],
    do_not_build: structuredClone(snapshot.do_not_build),
    next_action: structuredClone(nextAction),
    revisit_when: [],
    reopen_combination_rule: null,
  };
  if (fs.existsSync(fixture)) return fixture;
  for (const sub of ['decisions', 'research']) fs.mkdirSync(path.join(fixture, 'venture', sub), { recursive: true });
  fs.writeFileSync(path.join(fixture, 'venture', 'venture.yaml'), YAML.stringify(state));
  fs.writeFileSync(path.join(fixture, 'venture', 'decisions', 'D001.md'), projection(state.latest_decision, '# Decision D001'));
  fs.writeFileSync(path.join(fixture, 'venture', 'research', 'report.md'), '# Research\n');
  fs.writeFileSync(path.join(fixture, 'RESULT.md'), projection(state.latest_decision, '# Result'));
  return fixture;
}

function frozenByBatch(t, fake) {
  const run = newRun(t);
  const result = batch(fake, ['run', run.runId], { FAKE_FIXTURE: completedRunFixture(fake.dir) });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return run;
}

test('an unattended session runs under the fixed configuration and is frozen with its telemetry', (t) => {
  const fake = scratch(t);
  const { runId, runDir } = newRun(t);
  const result = batch(fake, ['run', runId], { FAKE_FIXTURE: completedRunFixture(fake.dir) });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /frozen [0-9a-f]{64}/);

  const started = startedWith(fake);
  assert.equal(started.option('-p'), `/eval-run ${runId}`);
  assert.equal(started.option('--model'), 'fake-model');
  assert.equal(started.option('--effort'), 'high');
  assert.equal(started.option('--setting-sources'), 'project');
  assert.equal(started.option('--permission-mode'), 'dontAsk');
  assert.ok(started.args.includes('--strict-mcp-config'));
  const excluded = JSON.parse(started.option('--settings')).claudeMdExcludes;
  assert.ok(excluded.some((file) => file.endsWith(`${path.sep}.claude${path.sep}CLAUDE.md`)), 'the operator\'s CLAUDE.md');
  assert.ok(excluded.includes(path.join(path.dirname(fs.realpathSync(repoRoot)), 'CLAUDE.md')), 'a CLAUDE.md above the checkout');
  assert.equal(started.allowed.some((tool) => /eval:(freeze|verdict|compare|fork)/.test(tool)), false, 'a run cannot run the evaluator side');
  assert.deepEqual(readJson(fake.log).env, { CLAUDECODE: null, CLAUDE_EFFORT: null, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' });

  const telemetry = readJson(path.join(runDir, 'telemetry.json'));
  assert.equal(telemetry.status, 'completed');
  assert.deepEqual(telemetry.requested, { model: 'fake-model', effort: 'high' });
  assert.deepEqual(telemetry.configuration, sessionConfiguration('run'));
  assert.equal(telemetry.turns, 8);
  assert.equal(telemetry.total_cost_usd, 2.5);
  assert.deepEqual(telemetry.permission_denials, [{ tool_name: 'Bash', tool_input: { command: 'curl https://example.com' }, reason: 'This command requires approval' }]);

  assert.ok(readJson(path.join(runDir, 'FROZEN.json')).files.includes('telemetry.json'), 'telemetry is sealed by freeze');
  assert.equal(runScript('verify-eval-run.mjs', [runId]).status, 0);

  const again = batch(fake, ['run', runId]);
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /Nothing started:[\s\S]*already frozen/);

  const summary = runScript('eval-summary.mjs', []);
  assert.equal(summary.status, 0, summary.stderr);
  assert.match(summary.stdout, new RegExp(`## Sessions[\\s\\S]*\\| ${runId} \\| /eval-run \\| fake-model \\| high \\| [0-9.]+ \\| 2\\.50 \\| 1 \\|`));
});

test('a session that did not load exactly this project is stopped at start and its run is never resumed', (t) => {
  const fake = scratch(t);
  const { runId, runDir } = newRun(t);
  const startedAt = Date.now();
  const result = batch(fake, ['run', runId], { FAKE_FIXTURE: completedRunFixture(fake.dir), FAKE_DROP_AGENT: 'challenger' });
  assert.notEqual(result.status, 0);
  assert.ok(Date.now() - startedAt < 20000, 'the session is stopped, not waited out');

  const telemetry = readJson(path.join(runDir, 'telemetry.json'));
  assert.equal(telemetry.status, 'failed');
  assert.match(telemetry.failure, /project agents not loaded: challenger/);
  assert.equal(fs.existsSync(path.join(runDir, 'RESULT.md')), false);
  assert.equal(fs.existsSync(path.join(runDir, 'FROZEN.json')), false);

  const again = batch(fake, ['run', runId], { FAKE_FIXTURE: completedRunFixture(fake.dir) });
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /a session already started on it/);
});

test('a session that ignores SIGTERM is killed', (t) => {
  const fake = scratch(t);
  const { runId } = newRun(t);
  const startedAt = Date.now();
  const result = batch(fake, ['run', runId], { FAKE_DROP_AGENT: 'challenger', FAKE_IGNORE_TERM: '1' });
  assert.notEqual(result.status, 0);
  assert.ok(Date.now() - startedAt < 20000, `took ${Date.now() - startedAt} ms`);
  assert.match(result.stdout, /project agents not loaded: challenger/);
});

test('a session whose output a process it started holds open still ends', (t) => {
  const fake = scratch(t);
  const { runId } = newRun(t);
  const startedAt = Date.now();
  const result = batch(fake, ['run', runId], { FAKE_FIXTURE: completedRunFixture(fake.dir), FAKE_ORPHAN: '1' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(Date.now() - startedAt < 15000, `took ${Date.now() - startedAt} ms`);
});

test('a session that ends in error keeps its telemetry and is not frozen', (t) => {
  const fake = scratch(t);
  const { runId, runDir } = newRun(t);
  const result = batch(fake, ['run', runId], { FAKE_FIXTURE: completedRunFixture(fake.dir), FAKE_RESULT_ERROR: '1' });
  assert.notEqual(result.status, 0);
  const telemetry = readJson(path.join(runDir, 'telemetry.json'));
  assert.equal(telemetry.status, 'failed');
  assert.match(telemetry.failure, /error_during_execution/);
  assert.equal(telemetry.total_cost_usd, 2.5);
  assert.equal(fs.existsSync(path.join(runDir, 'FROZEN.json')), false);
});

test('a session that freezes its own run leaves that run verifiable', (t) => {
  const fake = scratch(t);
  const { runId, runDir } = newRun(t);
  const result = batch(fake, ['run', runId], { FAKE_FIXTURE: completedRunFixture(fake.dir), FAKE_SELF_FREEZE: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /froze the run itself/);
  assert.equal(runScript('verify-eval-run.mjs', [runId]).status, 0);
  assert.equal(readJson(path.join(runDir, 'telemetry.json')).status, 'started');
});

test('nothing starts unless every session in the batch can', (t) => {
  const fake = scratch(t);
  const frozen = frozenByBatch(t, fake);
  fs.rmSync(fake.log);
  const fresh = newRun(t);
  const worked = newRun(t);
  fs.writeFileSync(path.join(worked.runDir, 'venture', 'venture.yaml'), 'name: left by a session opened by hand\n');
  const refused = newRun(t);
  fs.mkdirSync(path.join(refused.runDir, 'scores'));
  const edited = newRun(t);
  fs.appendFileSync(path.join(edited.runDir, 'case.yaml'), '# edited\n');

  const result = batch(fake, ['run', fresh.runId, frozen.runId, worked.runId, refused.runId, edited.runId]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Nothing started:/);
  assert.match(result.stderr, new RegExp(`${frozen.runId}: already frozen`));
  assert.match(result.stderr, new RegExp(`${worked.runId}: its venture/ already holds files`));
  assert.match(result.stderr, new RegExp(`${refused.runId}: it already has scores`));
  assert.match(result.stderr, new RegExp(`${edited.runId}: case.yaml changed`));
  assert.equal(fs.existsSync(fake.log), false, 'no session was started');
  assert.equal(fs.existsSync(path.join(fresh.runDir, 'telemetry.json')), false);

  const twice = batch(fake, ['run', fresh.runId, fresh.runId]);
  assert.notEqual(twice.status, 0);
  assert.match(twice.stderr, /one session per run/);
});

test('a fork continues with eval-continue', (t) => {
  const fake = scratch(t);
  const parent = frozenByBatch(t, fake);
  const forked = runScript('fork-eval-run.mjs', [parent.runId, '--arm', 'P001-a']);
  assert.equal(forked.status, 0, forked.stderr);
  const childId = forked.stdout.match(/^Created evals\/runs\/(\S+)$/m)[1];
  t.after(() => {
    fs.rmSync(path.join(runsDir, childId), { recursive: true, force: true });
    fs.rmSync(path.join(runsDir, '.keys', `${childId}.json`), { force: true });
  });

  const result = batch(fake, ['run', childId], { FAKE_RESULT_ERROR: '1' });
  assert.notEqual(result.status, 0);
  assert.equal(startedWith(fake).option('-p'), `/eval-continue ${childId}`);
});

test('a judge scores a frozen run in its own session and may change nothing else', (t) => {
  const fake = scratch(t);
  const { runId, runDir } = frozenByBatch(t, fake);
  const result = batch(fake, ['score', 'judge-a', runId]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(fs.existsSync(path.join(runDir, 'scores', 'judge-a.md')));
  const telemetry = readJson(path.join(runDir, 'scores', 'judge-a.telemetry.json'));
  assert.equal(telemetry.prompt, `/eval-score ${runId} judge-a`);
  assert.deepEqual(telemetry.configuration, sessionConfiguration('score'));
  const { allowed } = startedWith(fake);
  assert.ok(allowed.includes('Bash(npm run eval:verdict * --facts-only)'));
  assert.equal(allowed.some((tool) => tool.startsWith('Bash(npm run') && !/eval:verify|--facts-only/.test(tool)), false, 'a judge cannot print a verdict before its score is fixed');
  assert.equal(runScript('verify-eval-run.mjs', [runId]).status, 0);

  const again = batch(fake, ['score', 'judge-a', runId]);
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /judge judge-a already ran on it/);

  fs.writeFileSync(path.join(runDir, 'scores', 'judge-b.md'), '# Judge b\n');
  const tampering = batch(fake, ['score', 'judge-c', runId], { FAKE_TAMPER: '1' });
  assert.notEqual(tampering.status, 0);
  assert.match(tampering.stdout, /changed files it must not: judge-b\.md/);

  fs.writeFileSync(path.join(runDir, 'scores', 'pairs.json'), '{}\n');
  const afterVerdict = batch(fake, ['score', 'judge-d', runId]);
  assert.notEqual(afterVerdict.status, 0);
  assert.match(afterVerdict.stderr, /pairs\.json already in scores\//);
});

test('a comparison judge runs no script and cannot judge an unblinded comparison', (t) => {
  const fake = scratch(t);
  const first = frozenByBatch(t, fake);
  const second = frozenByBatch(t, fake);
  const built = runScript('eval-compare.mjs', [first.runId, second.runId]);
  assert.equal(built.status, 0, built.stderr);
  const compareId = built.stdout.match(/^Created evals\/compare\/(\S+)$/m)[1];
  const compareDir = path.join(repoRoot, 'evals', 'compare', compareId);
  t.after(() => {
    fs.rmSync(compareDir, { recursive: true, force: true });
    fs.rmSync(path.join(repoRoot, 'evals', 'compare', '.keys', `${compareId}.json`), { force: true });
  });

  const result = batch(fake, ['compare', 'judge-a', compareId]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(startedWith(fake).option('-p'), `/eval-compare ${compareId} judge-a`);
  assert.equal(startedWith(fake).allowed.some((tool) => tool.startsWith('Bash(npm')), false);
  assert.equal(readJson(path.join(compareDir, 'judgments', 'judge-a.telemetry.json')).status, 'completed');

  fs.writeFileSync(path.join(compareDir, 'result.json'), '{}\n');
  const unblinded = batch(fake, ['compare', 'judge-b', compareId]);
  assert.notEqual(unblinded.status, 0);
  assert.match(unblinded.stderr, /already unblinded/);
});
