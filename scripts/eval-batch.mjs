import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveSuite } from './eval-suite.mjs';
import {
  evaluatorBundle,
  evaluatorSourceHashes,
  hashPathSet,
  runtimeProvenance,
  sha256File,
  verifyFrozenRun,
} from './eval-provenance.mjs';
import { looksForked, readForkKey } from './reveal-utils.mjs';

// Runs eval sessions unattended: one fresh `claude -p` process per session,
// every session under the same fixed configuration. A session sees this
// project's settings, skills, agents and CLAUDE.md and nothing of the machine
// it runs on — not the operator's own instructions, plugins, MCP servers or
// auto-memory, any of which would make two runs of one framework differ for a
// reason no hash records.
//
// Evaluator-side, and deliberately without an npm alias: package.json is part
// of the hashed runtime, and the tool that runs a framework must not change the
// hash of the framework it runs. The configuration it imposes is written into
// every session's telemetry instead, so a change to it is visible run by run.

const readingShell = ['Bash(ls *)', 'Bash(wc *)', 'Bash(cat *)', 'Bash(head *)', 'Bash(tail *)', 'Bash(grep *)', 'Bash(find *)'];

// Where a session may write: its own run, a judge's scores/, a comparison's
// judgments/. <writable> stands for that directory in the recorded
// configuration, so every run of one kind records the same list. Each rule is
// given twice: a `./` rule does not match a Write whose file_path is absolute,
// which is how a judge lost its score file, and `//` is the absolute form.
const writing = ['Edit(./<writable>/**)', 'Write(./<writable>/**)', 'Edit(/<absolute-writable>/**)', 'Write(/<absolute-writable>/**)'];

// What each kind of session may do. Sessions run in dontAsk mode: a tool call
// outside its list is denied and recorded, never approved — only the CLI's
// built-in read-only commands pass unlisted. A run researches, writes its
// venture and runs the two framework scripts its skills call. A judge may run
// only the two commands its skill names, so it cannot print a verdict before
// its score is fixed. A comparison judge runs no script.
export const allowedTools = {
  run: [
    'Read', ...writing, 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Agent', 'Skill', 'TodoWrite',
    'Bash(npm run evidence:check *)', 'Bash(npm run experiment:lock *)', 'Bash(mkdir *)', ...readingShell,
  ],
  score: [
    'Read', ...writing, 'Glob', 'Grep', 'TodoWrite',
    'Bash(npm run eval:verify *)', 'Bash(npm run eval:verdict * --facts-only)', 'Bash(mkdir *)', ...readingShell,
  ],
  compare: ['Read', ...writing, 'Glob', 'Grep', 'TodoWrite', 'Bash(mkdir *)', ...readingShell],
  // Claude without Venture OS (scripts/eval-bare.mjs): the run's research
  // tools, in a working directory of its own, and no framework script.
  bare: ['Read', ...writing, 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Agent', 'TodoWrite', ...readingShell],
};

// Builtin plugins the CLI ships enabled. --setting-sources does not govern
// them and `claude plugin list` does not show them, so they are named here;
// one the CLI adds later fails the preflight before any run is taken.
const builtinPlugins = ['agents-md@builtin', 'telemetry@builtin'];
const permissionMode = 'dontAsk';
const efforts = ['low', 'medium', 'high', 'xhigh', 'max'];
const sessionTimeoutMs = 3 * 60 * 60 * 1000;
// How long a process gets to exit after SIGTERM, and its output to close after
// it exits — a process it started can hold that output open indefinitely.
const graceMs = 5000;

// Set by a Claude Code session and inherited by anything it starts: they would
// carry that session's identity, effort and experimental switches into the run.
const inheritedSessionVariables = [
  'AI_AGENT',
  'CLAUDECODE',
  'CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_EFFORT',
  'CLAUDE_PID',
];

export function sessionConfiguration(kind) {
  return {
    setting_sources: 'project',
    strict_mcp_config: true,
    auto_memory: false,
    instructions_outside_project: 'excluded',
    permission_mode: permissionMode,
    allowed_tools: allowedTools[kind],
  };
}

// Instruction files that load beside the project's own without being part of
// it: the operator's CLAUDE.md and rules, a local override, and any CLAUDE.md
// in a directory above the checkout. --setting-sources governs none of them,
// so each is excluded by path.
export function foreignInstructionFiles(root, env = process.env) {
  const configDir = env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const files = [path.join(configDir, 'CLAUDE.md'), path.join(root, 'CLAUDE.local.md')];
  const rulesDir = path.join(configDir, 'rules');
  if (fs.existsSync(rulesDir)) {
    files.push(...fs.readdirSync(rulesDir, { recursive: true }).filter((name) => String(name).endsWith('.md')).map((name) => path.join(rulesDir, String(name))));
  }
  for (let dir = path.dirname(fs.realpathSync(root)); ; dir = path.dirname(dir)) {
    files.push(path.join(dir, 'CLAUDE.md'), path.join(dir, 'CLAUDE.local.md'), path.join(dir, '.claude', 'CLAUDE.md'));
    if (path.dirname(dir) === dir) break;
  }
  return [...new Set(files)];
}

export function sessionInvocation({ kind, prompt, model, effort, root, writable, env = process.env }) {
  const settings = {
    claudeMdExcludes: foreignInstructionFiles(root, env),
    enabledPlugins: Object.fromEntries(builtinPlugins.map((plugin) => [plugin, false])),
  };
  const childEnv = { ...env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' };
  for (const name of inheritedSessionVariables) delete childEnv[name];
  return {
    args: [
      '-p', prompt,
      '--model', model,
      '--effort', effort,
      '--output-format', 'stream-json', '--verbose',
      '--setting-sources', 'project',
      '--strict-mcp-config',
      '--settings', JSON.stringify(settings),
      '--permission-mode', permissionMode,
      '--allowedTools', ...allowedTools[kind].map((tool) => tool.replace('<writable>', writable).replace('<absolute-writable>', path.resolve(root, writable))),
    ],
    env: childEnv,
  };
}

function projectEntries(root) {
  const skillsDir = path.join(root, '.claude', 'skills');
  const agentsDir = path.join(root, '.claude', 'agents');
  return {
    skills: fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsDir, entry.name, 'SKILL.md')))
      .map((entry) => entry.name),
    agents: fs.readdirSync(agentsDir).filter((name) => name.endsWith('.md')).map((name) => name.slice(0, -3)),
  };
}

// A session is the run it claims to be only if it loaded this project and
// nothing else: every project skill and agent, no plugin, no MCP server.
export function initErrors(init, root) {
  const { skills, agents } = projectEntries(root);
  const errors = [];
  const missingSkills = skills.filter((skill) => !(init.skills ?? []).includes(skill));
  const missingAgents = agents.filter((agent) => !(init.agents ?? []).includes(agent));
  if (missingSkills.length) errors.push(`project skills not loaded: ${missingSkills.join(', ')}`);
  if (missingAgents.length) errors.push(`project agents not loaded: ${missingAgents.join(', ')}`);
  if (init.plugins?.length) errors.push(`plugins loaded: ${init.plugins.map((plugin) => plugin.name ?? plugin).join(', ')}`);
  if (init.mcp_servers?.length) errors.push(`MCP servers loaded: ${init.mcp_servers.map((server) => server.name ?? server).join(', ')}`);
  if (init.permissionMode !== permissionMode) errors.push(`permission mode ${init.permissionMode}, expected ${permissionMode}`);
  return errors;
}

// A session that waits on background agents reports one result per turn; the
// last one carries the session's cumulative cost and model usage. Denials are
// reported both as events and on results, and are merged by tool call.
export function sessionTelemetry(events) {
  const init = events.find((event) => event.type === 'system' && event.subtype === 'init') ?? null;
  const results = events.filter((event) => event.type === 'result');
  const last = results.at(-1) ?? null;
  const denials = new Map();
  for (const event of events) {
    const reported = event.type === 'result'
      ? event.permission_denials ?? []
      : event.type === 'system' && event.subtype === 'permission_denied' ? [event] : [];
    for (const denial of reported) {
      const known = denials.get(denial.tool_use_id) ?? { tool_name: denial.tool_name, tool_input: null, reason: null };
      if (denial.tool_input) known.tool_input = denial.tool_input;
      if (denial.message) known.reason = denial.message;
      denials.set(denial.tool_use_id, known);
    }
  }
  return {
    claude_code_version: init?.claude_code_version ?? null,
    session_id: init?.session_id ?? null,
    auth: init?.apiKeySource ?? null,
    model: init?.model ?? null,
    turns: results.reduce((sum, result) => sum + (result.num_turns ?? 0), 0),
    total_cost_usd: last?.total_cost_usd ?? null,
    model_usage: last?.modelUsage ?? {},
    permission_denials: [...denials.values()],
  };
}

export function runSession({ root, claude, invocation, checkInit = (init) => initErrors(init, root) }) {
  return new Promise((resolve) => {
    const events = [];
    const timers = [];
    const later = (ms, action) => timers.push(setTimeout(action, ms));
    let failure = null;
    let stderr = '';
    let exitCode = null;
    let outputClosed = false;
    let processClosed = false;
    let settled = false;
    const child = spawn(claude, invocation.args, { cwd: root, env: invocation.env, stdio: ['ignore', 'pipe', 'pipe'] });

    const finish = () => {
      if (settled) return;
      settled = true;
      for (const timer of timers) clearTimeout(timer);
      const last = events.filter((event) => event.type === 'result').at(-1);
      if (!failure) {
        if (!last) failure = `the session ended without a result (exit ${exitCode})${stderr.trim() ? `: ${stderr.trim()}` : ''}`;
        else if (last.is_error || last.subtype !== 'success') failure = `the session ended with ${last.subtype}${last.result ? `: ${String(last.result).slice(0, 300)}` : ''}`;
        else if (exitCode !== 0) failure = `claude exited with ${exitCode}`;
      }
      resolve({ events, failure });
    };
    const abort = (reason) => {
      failure ??= reason;
      child.kill('SIGTERM');
      later(graceMs, () => child.kill('SIGKILL'));
    };
    later(sessionTimeoutMs, () => abort(`timed out after ${sessionTimeoutMs / 60000} minutes`));

    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      events.push(event);
      if (event.type === 'system' && event.subtype === 'init' && events.filter((seen) => seen.subtype === 'init').length === 1) {
        const errors = checkInit(event);
        if (errors.length) abort(`session configuration: ${errors.join('; ')}`);
      }
    });
    // The session is over once the process has exited and its output has
    // closed, so the last result line is never lost to the exit — or, when a
    // process it started holds that output open, a grace period after the exit.
    lines.on('close', () => {
      outputClosed = true;
      if (processClosed) finish();
    });
    child.on('exit', (code, signal) => {
      exitCode = code ?? signal;
      later(graceMs, () => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish();
      });
    });
    child.on('close', (code) => {
      processClosed = true;
      exitCode ??= code;
      if (outputClosed) finish();
    });
    child.on('error', (error) => {
      failure ??= `could not start ${claude}: ${error.message}`;
    });
  });
}

function validId(id) {
  return Boolean(id) && !id.includes('/') && !id.includes('..');
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function fileHashes(dir, skip) {
  if (!fs.existsSync(dir)) return new Map();
  return new Map(fs.readdirSync(dir, { recursive: true })
    .map(String)
    .filter((relative) => !skip.includes(relative) && fs.statSync(path.join(dir, relative)).isFile())
    .map((relative) => [relative, sha256File(path.join(dir, relative))]));
}

function changedFiles(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])].filter((relative) => before.get(relative) !== after.get(relative)).sort();
}

// The only state a session may start from is what eval:new or eval:fork left:
// a session that ran, by hand or here, leaves partial state a second session
// would read, so a run is never resumed — it is replaced by a new one.
function startingStateProblems(runsDir, runDir, forkKey) {
  const venture = hashPathSet(runDir, ['venture']);
  if (!forkKey) return venture.files.length ? ['its venture/ already holds files: a session already worked on it'] : [];
  const parentDir = path.join(runsDir, forkKey.parent.run_id);
  if (!fs.existsSync(parentDir)) return [`its parent ${forkKey.parent.run_id} is not under evals/runs/`];
  const parent = verifyFrozenRun(parentDir);
  if (!parent.ok || parent.marker.sha256 !== forkKey.parent.frozen_sha256) {
    return [`its parent ${forkKey.parent.run_id} is not the verified frozen run it was forked from`];
  }
  return venture.sha256 === hashPathSet(parentDir, ['venture']).sha256 ? [] : ['its venture/ differs from its parent\'s: a session already worked on it'];
}

// What freeze-eval-run.mjs checks that no session can change: any of it failing
// now would spend the session's hours on a run freeze then refuses.
function freezeBlockers(root, runDir, metadata, suitePath, forkKey) {
  const problems = [];
  const suiteLabel = metadata.suite?.label ?? null;
  let suite;
  try {
    suite = resolveSuite(root, suitePath);
  } catch (error) {
    return [error.message];
  }
  if (suite.label !== suiteLabel) {
    return [suiteLabel ? `created from suite ${suiteLabel}; pass --suite <path to that suite>` : 'created from this repository; drop --suite'];
  }
  if (!fs.existsSync(path.join(runDir, 'case.yaml')) || sha256File(path.join(runDir, 'case.yaml')) !== metadata.provenance.case_sha256) {
    problems.push('case.yaml changed since it was created');
  }
  if (runtimeProvenance(root).framework_sha256 !== metadata.provenance.framework_sha256) {
    problems.push('the effective runtime changed since it was created');
  }
  const current = evaluatorSourceHashes(root, metadata.case, suite.referenceDir, forkKey?.reveal.pair_id ?? null);
  for (const key of Object.keys(evaluatorBundle)) {
    if ((metadata.provenance.evaluator_sources?.[key] ?? null) !== (current[key] ?? null)) problems.push(`evaluator source ${key} changed since it was created`);
  }
  for (const reserved of ['evaluator', 'scores', 'SCORE.md']) {
    if (fs.existsSync(path.join(runDir, reserved))) problems.push(`it already has ${reserved}, which freeze refuses before freeze`);
  }
  return problems;
}

function runPlan(root, runId, suitePath) {
  const runsDir = path.join(root, 'evals', 'runs');
  const runDir = path.join(runsDir, runId);
  if (!validId(runId) || !fs.existsSync(runDir)) return { id: runId, problems: ['eval run not found'] };
  if (fs.existsSync(path.join(runDir, 'FROZEN.json'))) return { id: runId, problems: ['already frozen'] };
  const problems = [];
  if (fs.existsSync(path.join(runDir, 'telemetry.json'))) problems.push('a session already started on it; create a new run rather than resume its partial state');
  if (fs.existsSync(path.join(runDir, 'RESULT.md'))) problems.push('it already has a RESULT.md: a session already completed it');
  const forkKey = readForkKey(runsDir, runId);
  if (!forkKey && looksForked(runDir)) problems.push('it carries a fork\'s files but has no fork key in evals/runs/.keys/');
  problems.push(...startingStateProblems(runsDir, runDir, forkKey));
  const metadata = readJson(path.join(runDir, 'metadata.json'));
  if (!metadata?.provenance?.framework_sha256 || !metadata.provenance.case_sha256) problems.push('metadata.json has no creation provenance');
  else problems.push(...freezeBlockers(root, runDir, metadata, suitePath, forkKey));

  const skill = forkKey ? 'eval-continue' : 'eval-run';
  return {
    id: runId,
    kind: 'run',
    problems,
    prompt: `/${skill} ${runId}`,
    writable: path.relative(root, runDir),
    telemetryPath: path.join(runDir, 'telemetry.json'),
    // Freeze seals the telemetry as it stands; a run the session froze itself
    // keeps the record written when it started.
    sealed: () => fs.existsSync(path.join(runDir, 'FROZEN.json')),
    guard: null,
    output: path.join(runDir, 'RESULT.md'),
    complete() {
      const freeze = spawnSync(process.execPath, [path.join(root, 'scripts', 'freeze-eval-run.mjs'), runId, ...(suitePath ? ['--suite', suitePath] : [])], {
        cwd: root,
        encoding: 'utf8',
      });
      if (freeze.status !== 0) return { error: `freeze refused it:\n${(freeze.stderr || freeze.stdout).trim()}` };
      const verified = verifyFrozenRun(runDir);
      if (!verified.ok) return { error: `frozen but not verified: ${verified.errors.join('; ')}` };
      return { note: `frozen ${verified.marker.sha256}` };
    },
  };
}

// A judge writes one file. Everything else in the directory it works in is
// hashed before and after its session: another judge's file, a verdict, the
// artifacts under comparison.
function judgedPlan({ root, kind, id, label, targetDir, workDir, outputPath, prompt, missing, check, alsoSkip = [] }) {
  if (!validId(id) || !fs.existsSync(targetDir)) return { id, problems: [missing] };
  const telemetryPath = outputPath.replace(/\.md$/, '.telemetry.json');
  const problems = [...check()];
  if (fs.existsSync(outputPath) || fs.existsSync(telemetryPath)) problems.push(`judge ${label} already ran on it`);
  const skip = [outputPath, telemetryPath].map((file) => path.relative(workDir, file)).concat(alsoSkip);
  return {
    id,
    kind,
    problems,
    prompt,
    writable: path.relative(root, path.dirname(outputPath)),
    telemetryPath,
    sealed: () => false,
    guard: { dir: workDir, skip },
    output: outputPath,
    complete: () => ({ note: `wrote ${path.relative(targetDir, outputPath)}` }),
  };
}

function scorePlan(root, label, runId) {
  const runDir = path.join(root, 'evals', 'runs', runId);
  const scoresDir = path.join(runDir, 'scores');
  const plan = judgedPlan({
    root,
    kind: 'score',
    id: runId,
    label,
    targetDir: runDir,
    workDir: scoresDir,
    outputPath: path.join(scoresDir, `${label}.md`),
    prompt: `/eval-score ${runId} ${label}`,
    missing: 'eval run not found',
    // The judge regenerates the fact sheet itself.
    alsoSkip: ['facts.json'],
    check: () => {
      const problems = verifyFrozenRun(runDir).ok ? [] : ['not a verified frozen run'];
      const verdicts = ['mechanical.json', 'pairs.json'].filter((name) => fs.existsSync(path.join(scoresDir, name)));
      if (verdicts.length) problems.push(`${verdicts.join(' and ')} already in scores/, where the judge could read it; judge a run before eval:verdict`);
      return problems;
    },
  });
  if (plan.problems.includes('eval run not found')) return plan;
  return {
    ...plan,
    complete() {
      const verified = verifyFrozenRun(runDir);
      if (!verified.ok) return { error: `the judge changed the frozen run: ${verified.errors.join('; ')}` };
      return plan.complete();
    },
  };
}

function comparePlan(root, label, compareId) {
  const compareDir = path.join(root, 'evals', 'compare', compareId);
  return judgedPlan({
    root,
    kind: 'compare',
    id: compareId,
    label,
    targetDir: compareDir,
    workDir: compareDir,
    outputPath: path.join(compareDir, 'judgments', `${label}.md`),
    prompt: `/eval-compare ${compareId} ${label}`,
    missing: 'comparison not found',
    check: () => [
      ...(fs.existsSync(path.join(compareDir, 'compare.md')) ? [] : ['it has no compare.md']),
      ...(fs.existsSync(path.join(compareDir, 'result.json')) ? ['it is already unblinded'] : []),
    ],
  });
}

export const probePrompt = 'Reply with the single word OK.';

// Starts one session and stops it as soon as it reports what it loaded, before
// any run is taken: a CLI update that enabled a new plugin, or an account that
// cannot start the model, fails here once instead of in every session.
function preflight(root, claude, { kind, model, effort }) {
  return new Promise((resolve) => {
    const invocation = sessionInvocation({ kind, prompt: probePrompt, model, effort, root, writable: 'evals/runs/.preflight' });
    const child = spawn(claude, invocation.args, { cwd: root, env: invocation.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let answer = null;
    let stderr = '';
    const settle = (errors) => {
      answer ??= errors;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => settle(['it reported no configuration within two minutes']), 120000);
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        const event = JSON.parse(line);
        if (event.type === 'system' && event.subtype === 'init') settle(initErrors(event, root));
      } catch {
        // not an event
      }
    });
    child.on('error', (error) => settle([`could not start ${claude}: ${error.message}`]));
    child.on('close', () => {
      clearTimeout(timer);
      resolve(answer ?? [`it ended without reporting its configuration${stderr.trim() ? `: ${stderr.trim()}` : ''}`]);
    });
  });
}

async function execute(root, plan, { claude, model, effort }) {
  const log = (message) => console.log(`[${plan.id}] ${message}`);
  const startedAt = new Date();
  const record = {
    telemetry_version: 1,
    prompt: plan.prompt,
    requested: { model, effort },
    configuration: sessionConfiguration(plan.kind),
    started_at: startedAt.toISOString(),
  };
  // Written before the session starts, exclusively: it marks the run as taken
  // even if this process is killed, and a second batch on the same ID loses.
  try {
    fs.mkdirSync(path.dirname(plan.telemetryPath), { recursive: true });
    fs.writeFileSync(plan.telemetryPath, JSON.stringify({ ...record, status: 'started' }, null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    log('another session started on it first');
    return { id: plan.id, failure: 'another session started on it first' };
  }
  log(`${plan.prompt} started`);
  const before = plan.guard ? fileHashes(plan.guard.dir, plan.guard.skip) : null;
  const session = await runSession({ root, claude, invocation: sessionInvocation({ kind: plan.kind, prompt: plan.prompt, model, effort, root, writable: plan.writable }) });
  const finishedAt = new Date();

  let failure = session.failure;
  if (!failure && !fs.existsSync(plan.output)) failure = `the session wrote no ${path.basename(plan.output)}`;
  if (!failure && plan.guard) {
    const changed = changedFiles(before, fileHashes(plan.guard.dir, plan.guard.skip));
    if (changed.length) failure = `the session changed files it must not: ${changed.join(', ')}`;
  }
  const telemetry = sessionTelemetry(session.events);
  if (plan.sealed()) {
    failure = `the session froze the run itself${failure ? ` and then failed: ${failure}` : ''}; its telemetry is sealed as started`;
  } else {
    fs.writeFileSync(plan.telemetryPath, JSON.stringify({
      ...record,
      status: failure ? 'failed' : 'completed',
      failure,
      finished_at: finishedAt.toISOString(),
      wall_seconds: Math.round((finishedAt - startedAt) / 1000),
      ...telemetry,
    }, null, 2) + '\n');
  }
  const minutes = ((finishedAt - startedAt) / 60000).toFixed(1);
  const cost = typeof telemetry.total_cost_usd === 'number' ? `${telemetry.total_cost_usd.toFixed(2)} USD at list price` : 'unknown cost';
  log(`session ${failure ? `failed: ${failure}` : 'completed'} — ${minutes} min, ${cost}, ${telemetry.permission_denials.length} permission denial(s)`);
  if (failure) return { id: plan.id, failure };

  const completed = plan.complete();
  if (completed.error) {
    log(completed.error);
    return { id: plan.id, failure: completed.error };
  }
  log(completed.note);
  return { id: plan.id, failure: null };
}

async function pool(items, jobs, worker) {
  const outcomes = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      outcomes[index] = await worker(items[index]);
    }
  }));
  return outcomes;
}

const usage = `Usage:
  node scripts/eval-batch.mjs run <run-id>... --model <model> --effort <level> [--suite <path>] [--jobs <n>] [--claude <path>]
  node scripts/eval-batch.mjs score <judge-label> <run-id>... --model <model> --effort <level> [--jobs <n>] [--claude <path>]
  node scripts/eval-batch.mjs compare <judge-label> <compare-id>... --model <model> --effort <level> [--jobs <n>] [--claude <path>]`;

function stop(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  let args;
  try {
    args = parseArgs({
      allowPositionals: true,
      options: {
        model: { type: 'string' },
        effort: { type: 'string' },
        suite: { type: 'string' },
        jobs: { type: 'string', default: '1' },
        claude: { type: 'string', default: 'claude' },
      },
    });
  } catch (error) {
    stop(`${error.message}\n${usage}`);
  }
  const { model, effort, suite, claude } = args.values;
  const [kind, ...rest] = args.positionals;
  if (!['run', 'score', 'compare'].includes(kind) || !model || !efforts.includes(effort)) stop(usage);
  if (!/^[1-9][0-9]*$/.test(args.values.jobs)) stop('--jobs must be a positive integer');
  if (suite && kind !== 'run') stop('--suite applies to run only: a judge reads the frozen run.');

  let label = null;
  let ids = rest;
  if (kind !== 'run') {
    [label, ...ids] = rest;
    if (!label || !/^[a-zA-Z0-9._-]+$/.test(label)) stop('The judge label may contain only letters, numbers, dots, underscores and hyphens.');
  }
  if (!ids.length) stop(usage);
  if (new Set(ids).size !== ids.length) stop('Each ID may appear once: one session per run.');

  const root = process.cwd();
  const plans = ids.map((id) => {
    if (kind === 'run') return runPlan(root, id, suite);
    if (kind === 'score') return scorePlan(root, label, id);
    return comparePlan(root, label, id);
  });
  // Nothing starts unless every session can: a batch that fails on its fifth
  // run after four hours has spent the four hours on a partial baseline.
  const problems = plans.flatMap((plan) => plan.problems.map((problem) => `  - ${plan.id}: ${problem}`));
  if (problems.length) stop(`Nothing started:\n${problems.join('\n')}`);
  const misconfigured = await preflight(root, claude, { kind, model, effort });
  if (misconfigured.length) stop(`Nothing started: a probe session is not isolated as a run must be:\n${misconfigured.map((error) => `  - ${error}`).join('\n')}`);

  const outcomes = await pool(plans, Number(args.values.jobs), (plan) => execute(root, plan, { claude, model, effort }));
  const failed = outcomes.filter((outcome) => outcome.failure);
  console.log(`${outcomes.length - failed.length} of ${outcomes.length} session(s) completed.`);
  if (failed.length) process.exit(1);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  await main();
}
