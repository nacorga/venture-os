import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { looksForked, readForkKey } from './reveal-utils.mjs';
import { parseYamlSource } from './venture-utils.mjs';

// One read-out across frozen runs: judged scores with their spread between
// judges, mechanical verdicts on forks, pair verdicts, blind comparisons and
// fact-sheet alarms. Evaluator-side; it reads each run's scores/, metadata,
// marker and latest decision, and the sealed fork keys beside the runs.

let args;
try {
  args = parseArgs({
    options: {
      runs: { type: 'string', default: path.join('evals', 'runs') },
      compare: { type: 'string', default: path.join('evals', 'compare') },
      case: { type: 'string' },
    },
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const runsDir = path.resolve(process.cwd(), args.values.runs);
const compareDir = path.resolve(process.cwd(), args.values.compare);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// A block that does not carry a scores map is treated as unparsed, so one
// malformed file cannot take the summary down with it.
export function parseScoreBlock(source) {
  const match = /<!-- venture-os-score:start -->\n([\s\S]*?)<!-- venture-os-score:end -->/.exec(source);
  if (!match) return null;
  const parsed = parseYamlSource(match[1], 'score block');
  if (!parsed.valid) return null;
  const { scores } = parsed.value;
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) return null;
  return parsed.value;
}

function short(sha) {
  return sha ? sha.slice(0, 8) : 'unknown';
}

const runs = fs.existsSync(runsDir)
  ? fs.readdirSync(runsDir)
    .map((name) => ({ name, dir: path.join(runsDir, name) }))
    .filter(({ dir }) => fs.existsSync(path.join(dir, 'FROZEN.json')))
    .map((run) => ({
      ...run,
      metadata: readJson(path.join(run.dir, 'metadata.json')) ?? {},
      marker: readJson(path.join(run.dir, 'FROZEN.json')) ?? {},
      forkKey: readForkKey(runsDir, run.name),
    }))
    .filter(({ metadata }) => !args.values.case || metadata.case === args.values.case)
  : [];

function scoresOf(run) {
  const scoresDir = path.join(run.dir, 'scores');
  const found = [];
  if (fs.existsSync(scoresDir)) {
    for (const name of fs.readdirSync(scoresDir).filter((entry) => entry.endsWith('.md')).sort()) {
      found.push({ judge: name.slice(0, -3), block: parseScoreBlock(fs.readFileSync(path.join(scoresDir, name), 'utf8')) });
    }
  }
  if (fs.existsSync(path.join(run.dir, 'SCORE.md'))) found.push({ judge: 'SCORE.md (legacy)', block: null });
  return found;
}

const lines = [];
const out = (line = '') => lines.push(line);

out('# Eval summary');
out();
out(`${runs.length} frozen run(s) under \`${path.relative(process.cwd(), runsDir) || '.'}\`${args.values.case ? `, case ${args.values.case}` : ''}.`);

const parents = runs.filter((run) => !run.forkKey && !looksForked(run.dir));
const forks = runs.filter((run) => run.forkKey);

out();
out('## First-phase runs and judges');
out();
out('| Run | Case | Framework | Outcome | Judges | Totals | Items where judges differ by more than 1 |');
out('| --- | --- | --- | --- | --- | --- | --- |');
const itemStats = new Map();
for (const run of parents) {
  const venture = parseYamlSource(fs.readFileSync(path.join(run.dir, 'venture', 'venture.yaml'), 'utf8'), 'venture.yaml');
  const outcome = venture.value?.latest_decision?.outcome ?? '?';
  const scores = scoresOf(run);
  const parsed = scores.filter((score) => score.block);
  const disagreements = [];
  const items = new Set(parsed.flatMap((score) => Object.keys(score.block.scores ?? {})));
  for (const item of items) {
    const values = parsed.map((score) => score.block.scores[item]).filter((value) => typeof value === 'number');
    if (values.length > 1 && Math.max(...values) - Math.min(...values) > 1) disagreements.push(item);
    if (!values.length) continue;
    const key = `${run.metadata.case}|${short(run.marker.framework_sha256)}|${item}`;
    if (!itemStats.has(key)) itemStats.set(key, []);
    itemStats.get(key).push(...values);
  }
  const totals = scores.map((score) => (score.block ? `${score.judge} ${score.block.total ?? '?'}` : `${score.judge} unparsed`)).join(', ') || '—';
  out(`| ${run.name} | ${run.metadata.case} | ${short(run.marker.framework_sha256)} | ${outcome} | ${scores.length} | ${totals} | ${disagreements.join(', ') || '—'} |`);
}

out();
out('## Judged items across runs');
out();
if (!itemStats.size) out('No parsed score blocks yet.');
else {
  out('| Case | Framework | Item | n | Mean | Range |');
  out('| --- | --- | --- | --- | --- | --- |');
  for (const [key, values] of [...itemStats].sort(([a], [b]) => a.localeCompare(b))) {
    const [caseId, framework, item] = key.split('|');
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    out(`| ${caseId} | ${framework} | ${item} | ${values.length} | ${mean.toFixed(2)} | ${Math.min(...values)}–${Math.max(...values)} |`);
  }
}

out();
out('## Forks: mechanical verdicts');
out();
if (!forks.length) out('No frozen forks yet.');
else {
  out('| Fork | Arm | Framework | First → second | Verdict | Failed checks |');
  out('| --- | --- | --- | --- | --- | --- |');
  for (const run of forks) {
    const verdict = readJson(path.join(run.dir, 'scores', 'mechanical.json'));
    if (!verdict) {
      out(`| ${run.name} | ${run.forkKey.reveal.arm} | ${short(run.marker.framework_sha256)} | — | not run | — |`);
      continue;
    }
    const failed = verdict.checks.filter((check) => !check.pass).map((check) => check.check + (check.item ? ` ${check.item}` : '')).join(', ');
    out(`| ${run.name} | ${verdict.arm} | ${short(run.marker.framework_sha256)} | ${verdict.first_decision.outcome} → ${verdict.second_decision.outcome} | ${verdict.pass ? 'PASS' : 'FAIL'} | ${failed || '—'} |`);
  }
}

out();
out('## Reveal pairs');
out();
const pairRows = parents.flatMap((run) => (readJson(path.join(run.dir, 'scores', 'pairs.json'))?.pairs ?? []).map((pair) => ({ run: run.name, ...pair })));
if (!pairRows.length) out('No pair verdicts yet.');
else {
  out('| Parent | Pair | Rep | Framework | a | b | Expected | Result |');
  out('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const pair of pairRows) out(`| ${pair.run} | ${pair.pair} | ${pair.rep} | ${short(pair.framework_sha256)} | ${pair.outcomes.a} | ${pair.outcomes.b} | ${pair.expected} | ${pair.result} |`);
}

out();
out('## Blind comparisons');
out();
const comparisons = fs.existsSync(compareDir)
  ? fs.readdirSync(compareDir).filter((name) => !name.startsWith('.')).map((name) => readJson(path.join(compareDir, name, 'result.json'))).filter(Boolean)
    .filter((result) => !args.values.case || result.case === args.values.case)
  : [];
if (!comparisons.length) out('No unblinded comparisons yet.');
else {
  out('| Comparison | Case | Same framework | Judges | Overall |');
  out('| --- | --- | --- | --- | --- |');
  for (const result of comparisons) {
    const overall = result.runs.map((run) => `${run} (${short(result.framework_sha256[run])}) ${result.overall[run]}`).join(' · ');
    out(`| ${result.id} | ${result.case} | ${result.same_framework ? 'yes' : 'no'} | ${result.judgments.length} | ${overall} · tie ${result.overall.tie} |`);
  }
}

out();
out('## Fact-sheet alarms');
out();
const alarms = runs.flatMap((run) => (readJson(path.join(run.dir, 'scores', 'facts.json'))?.alarms ?? []).map((alarm) => `- ${run.name}: ${alarm}`));
out(alarms.length ? alarms.join('\n') : 'None.');

console.log(lines.join('\n'));
