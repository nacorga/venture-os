import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveSuite, validateSuiteCase } from './eval-suite.mjs';
import { sha256File } from './eval-provenance.mjs';
import { gateRank, plantedPacket, revealPairPath, validateRevealPairFile } from './reveal-utils.mjs';
import { runSession, sessionConfiguration, sessionInvocation, sessionTelemetry } from './eval-batch.mjs';

// The same case and the same planted reveal pair, given to Claude without
// Venture OS: one session researches the idea and decides, and each arm of the
// pair continues a copy of that session with the arm's evidence. What it is
// scored on is what a pair verdict reads — each arm's outcome against the
// pair's expectations and the order between the arms — so it answers one
// question: does a run under Venture OS keep a pair in order more often than
// Claude asked plainly? Traps are not scored: they read evidence records, and
// a plain answer keeps none.
//
// Each session runs in a working directory outside this checkout, so neither
// this project's CLAUDE.md nor its skills and agents load, under the unattended
// runner's configuration otherwise: same model, effort, research tools,
// permission mode and isolation from the operator's machine.

export const decisionLine = 'end your answer with exactly one line: DECISION: PROCEED, DECISION: TEST or DECISION: PARK';

export function firstPrompt(caseValue) {
  return `I'm considering this business idea.\n\n${caseValue.title}: ${caseValue.statement}\n\nResearch it as thoroughly as you judge useful and tell me whether to PROCEED and build it, TEST a critical assumption first with a cheap experiment, or PARK it. Explain your reasoning, and ${decisionLine}.`;
}

export function revealPrompt(packet) {
  const items = packet.items.map((item) => `- ${item.text}`).join('\n');
  return `New evidence has arrived since your assessment.\n\n${packet.summary}\n\n${items}\n\nReassess the idea in light of it and tell me again whether to PROCEED, TEST or PARK. Explain your reasoning, and ${decisionLine}.`;
}

export function parseDecision(text) {
  const found = [...String(text ?? '').matchAll(/DECISION:\s*\**\s*(PROCEED|TEST|PARK)\b/g)];
  return found.at(-1)?.[1] ?? null;
}

export function pairResult(expect, outcomes) {
  const checks = [];
  for (const side of ['a', 'b']) {
    const expectation = expect[side] ?? {};
    const outcome = outcomes[side];
    if (expectation.outcome_in) checks.push({ side, check: 'outcome_in', expected: expectation.outcome_in, actual: outcome, pass: expectation.outcome_in.includes(outcome) });
    if (expectation.outcome_not_in) checks.push({ side, check: 'outcome_not_in', expected: expectation.outcome_not_in, actual: outcome, pass: !expectation.outcome_not_in.includes(outcome) });
  }
  let order = null;
  if (expect.order && outcomes.a && outcomes.b) {
    const difference = expect.order === 'a<b' ? gateRank[outcomes.b] - gateRank[outcomes.a] : gateRank[outcomes.a] - gateRank[outcomes.b];
    order = difference > 0 ? 'ordered' : difference === 0 ? 'tied' : 'inverted';
  }
  return { order, checks, pass: order !== 'inverted' && checks.every((check) => check.pass) };
}

// A plain session has no project: it must load none of this repository's
// skills and agents, no plugin and no MCP server.
function bareInitErrors(init) {
  const errors = [];
  const framework = [...(init.skills ?? []), ...(init.agents ?? [])].filter((name) => /^(venture|eval)-|^(challenger|gatekeeper|market-researcher|competitor-analyst|evidence-auditor|experiment-designer|positioning-strategist)$/.test(name));
  if (framework.length) errors.push(`Venture OS loaded: ${framework.join(', ')}`);
  if (init.plugins?.length) errors.push(`plugins loaded: ${init.plugins.map((plugin) => plugin.name ?? plugin).join(', ')}`);
  if (init.mcp_servers?.length) errors.push(`MCP servers loaded: ${init.mcp_servers.map((server) => server.name ?? server).join(', ')}`);
  if (init.permissionMode !== 'dontAsk') errors.push(`permission mode ${init.permissionMode}, expected dontAsk`);
  return errors;
}

async function session({ workDir, claude, model, effort, prompt, resume = null }) {
  const invocation = sessionInvocation({ kind: 'bare', prompt, model, effort, root: workDir, writable: '.' });
  if (resume) invocation.args.push('--resume', resume, '--fork-session');
  const startedAt = new Date();
  const result = await runSession({ root: workDir, claude, invocation, checkInit: bareInitErrors });
  const telemetry = sessionTelemetry(result.events);
  const answer = result.events.filter((event) => event.type === 'result').at(-1)?.result ?? '';
  return {
    failure: result.failure,
    answer,
    decision: parseDecision(answer),
    telemetry: { ...telemetry, wall_seconds: Math.round((Date.now() - startedAt) / 1000) },
  };
}

async function bareRun(root, { caseId, suitePath, pairId, rep, claude, model, effort }) {
  const suite = resolveSuite(root, suitePath);
  const caseResult = validateSuiteCase(suite, caseId);
  const pairFile = revealPairPath(suite.referenceDir, caseId, pairId);
  const pair = validateRevealPairFile(pairFile, caseId).value;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const id = `${stamp}-${caseId}-bare-${model}-r${rep}-${crypto.randomBytes(2).toString('hex')}`;
  const outDir = path.join(root, 'evals', 'bare', id);
  const workDir = path.join(os.tmpdir(), 'venture-os-bare', id);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });
  const log = (message) => console.log(`[${id}] ${message}`);

  const record = {
    id,
    case: caseId,
    suite: suite.label,
    pair: pairId,
    pair_sha256: sha256File(pairFile),
    case_sha256: sha256File(caseResult.casePath),
    rep,
    requested: { model, effort },
    configuration: sessionConfiguration('bare'),
    prompts: { first: firstPrompt(caseResult.value), reveal: revealPrompt({ summary: '<arm summary>', items: [{ text: '<arm item>' }] }) },
    started_at: new Date().toISOString(),
    phases: {},
  };
  const save = () => fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(record, null, 2) + '\n');

  log('first phase started');
  const first = await session({ workDir, claude, model, effort, prompt: record.prompts.first });
  fs.writeFileSync(path.join(outDir, 'phase1.md'), first.answer);
  record.phases.first = { decision: first.decision, failure: first.failure, ...first.telemetry };
  if (first.failure || !first.decision || !first.telemetry.session_id) {
    record.failure = first.failure ?? 'the first phase stated no decision';
    save();
    log(`failed: ${record.failure}`);
    return record;
  }
  log(`first phase: ${first.decision}`);

  const outcomes = {};
  for (const side of ['a', 'b']) {
    const packet = plantedPacket(pair, side);
    const phase = await session({ workDir, claude, model, effort, prompt: revealPrompt(packet), resume: first.telemetry.session_id });
    fs.writeFileSync(path.join(outDir, `phase2-${side}.md`), phase.answer);
    record.phases[side] = { decision: phase.decision, failure: phase.failure, packet_sha256: crypto.createHash('sha256').update(JSON.stringify(packet)).digest('hex'), ...phase.telemetry };
    outcomes[side] = phase.decision;
    log(`arm ${side}: ${phase.decision ?? `failed: ${phase.failure ?? 'no decision'}`}`);
  }
  if (outcomes.a && outcomes.b) record.verdict = pairResult(pair.expect ?? {}, outcomes);
  else record.failure = 'an arm stated no decision';
  record.finished_at = new Date().toISOString();
  record.total_cost_usd = Object.values(record.phases).reduce((sum, phase) => sum + (phase.total_cost_usd ?? 0), 0);
  save();
  fs.rmSync(workDir, { recursive: true, force: true });
  if (record.verdict) log(`${record.verdict.order}, ${record.verdict.pass ? 'PASS' : 'FAIL'} (${first.decision} → a ${outcomes.a}, b ${outcomes.b})`);
  return record;
}

const usage = 'Usage: node scripts/eval-bare.mjs <case>... --model <model> --effort <level> [--suite <path>] [--pair P001] [--reps <n>] [--jobs <n>] [--claude <path>]';

async function main() {
  let args;
  try {
    args = parseArgs({
      allowPositionals: true,
      options: {
        model: { type: 'string' },
        effort: { type: 'string' },
        suite: { type: 'string' },
        pair: { type: 'string', default: 'P001' },
        reps: { type: 'string', default: '1' },
        jobs: { type: 'string', default: '1' },
        claude: { type: 'string', default: 'claude' },
      },
    });
  } catch (error) {
    console.error(`${error.message}\n${usage}`);
    process.exit(1);
  }
  const { model, effort, suite: suitePath, pair: pairId, claude } = args.values;
  const cases = args.positionals;
  if (!cases.length || !model || !['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) {
    console.error(usage);
    process.exit(1);
  }
  if (!/^P\d{3}$/.test(pairId) || !/^[1-9]\d*$/.test(args.values.reps) || !/^[1-9]\d*$/.test(args.values.jobs)) {
    console.error(usage);
    process.exit(1);
  }

  const root = process.cwd();
  let suite;
  try {
    suite = resolveSuite(root, suitePath);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  const problems = [];
  for (const caseId of cases) {
    if (!validateSuiteCase(suite, caseId).valid) problems.push(`${caseId}: not a valid case of ${suite.label ?? 'this repository'}`);
    const pairFile = revealPairPath(suite.referenceDir, caseId, pairId);
    if (!fs.existsSync(pairFile)) problems.push(`${caseId}: no reveal pair ${pairId}`);
    else if (!validateRevealPairFile(pairFile, caseId).valid) problems.push(`${caseId}: reveal pair ${pairId} is invalid`);
  }
  if (problems.length) {
    console.error(`Nothing started:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    process.exit(1);
  }

  const jobs = cases.flatMap((caseId) => Array.from({ length: Number(args.values.reps) }, (_, index) => ({ caseId, rep: index + 1 })));
  const records = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(Number(args.values.jobs), jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next];
      next += 1;
      records.push(await bareRun(root, { ...job, suitePath, pairId, claude, model, effort }));
    }
  }));
  const failed = records.filter((record) => !record.verdict);
  console.log(`${records.length - failed.length} of ${records.length} bare run(s) completed.`);
  if (failed.length) process.exit(1);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  await main();
}
