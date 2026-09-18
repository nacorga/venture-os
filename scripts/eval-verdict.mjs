import fs from 'node:fs';
import path from 'node:path';
import { hashPathSet, verifyFrozenRun } from './eval-provenance.mjs';
import { decisionRuleOutcome } from './experiment-utils.mjs';
import { evidenceCiting, gateRank, readForkKey } from './reveal-utils.mjs';
import { parseYamlFile } from './venture-utils.mjs';

// Mechanical verdicts on frozen runs. Evaluator-side: it reads expectations the
// run never saw, so it is not part of the hashed runtime. Each output stamps the
// hash of this tool and of the frozen run it read, so a verdict can be
// regenerated and compared rather than trusted.

const toolFiles = [
  'scripts/eval-verdict.mjs',
  'scripts/eval-provenance.mjs',
  'scripts/experiment-utils.mjs',
  'scripts/reveal-utils.mjs',
  'scripts/venture-utils.mjs',
];
const strengthRank = { unknown: 0, weak: 1, medium: 2, strong: 3 };

const [runId] = process.argv.slice(2);
if (!runId || runId.includes('/') || runId.includes('..')) {
  console.error('Usage: npm run eval:verdict -- <run-id>');
  process.exit(1);
}

const root = process.cwd();
const runsDir = path.join(root, 'evals', 'runs');
const runDir = path.join(runsDir, runId);
const tool = { sha256: hashPathSet(root, toolFiles).sha256 };

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function frozenOrStop(dir, id) {
  const verified = verifyFrozenRun(dir);
  if (!verified.ok) {
    console.error(`Cannot judge ${id}: it is not a verified frozen run.`);
    for (const error of verified.errors) console.error(`  ${error}`);
    process.exit(1);
  }
  return verified.marker;
}

function writeScore(dir, file, value) {
  fs.mkdirSync(path.join(dir, 'scores'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'scores', file), JSON.stringify(value, null, 2) + '\n');
}

function childVerdict(dir, runId, key) {
  const venture = parseYamlFile(path.join(dir, 'venture', 'venture.yaml'), 'venture.yaml').value;
  const decision = venture.latest_decision;
  const checks = [];

  if (key.reveal.kind === 'prereg') {
    const expectedBranch = key.reveal.branch;
    const experimentPath = path.join(dir, key.reveal.experiment_path);
    const experiment = parseYamlFile(experimentPath, 'experiment').value;
    const recordedBranch = experiment.results?.branch ?? null;
    checks.push({
      check: 'branch_classified',
      expected: expectedBranch,
      actual: recordedBranch,
      pass: recordedBranch === expectedBranch,
    });
    const preregistered = decisionRuleOutcome(experiment.preregistration.design.decision_rules[`on_${expectedBranch}`]);
    checks.push({
      check: 'outcome_follows_preregistration',
      expected: preregistered,
      actual: decision.outcome,
      pass: preregistered !== null && decision.outcome === preregistered,
    });
    const decisionText = fs.readFileSync(path.join(dir, 'venture', decision.path), 'utf8');
    checks.push({
      check: 'routing_recorded',
      detail: 'the decision file carries ## Pre-registered routing',
      pass: /^## Pre-registered routing\s*$/m.test(decisionText),
    });
  } else {
    const pair = parseYamlFile(path.join(dir, 'evaluator', 'reveal-pair.yaml'), 'reveal pair').value;
    const side = key.reveal.side;
    const expectation = pair.expect?.[side] ?? {};
    if (expectation.outcome_in) {
      checks.push({ check: 'outcome_in', expected: expectation.outcome_in, actual: decision.outcome, pass: expectation.outcome_in.includes(decision.outcome) });
    }
    if (expectation.outcome_not_in) {
      checks.push({ check: 'outcome_not_in', expected: expectation.outcome_not_in, actual: decision.outcome, pass: !expectation.outcome_not_in.includes(decision.outcome) });
    }
    for (const trap of (pair.expect?.traps ?? []).filter((item) => item.arm === side || item.arm === 'both')) {
      const records = evidenceCiting(venture.evidence_index, trap.item);
      const failures = [];
      for (const record of records) {
        if (trap.max_strength && strengthRank[record.strength] > strengthRank[trap.max_strength]) {
          failures.push(`${record.id} is ${record.strength}, above ${trap.max_strength}`);
        }
        if (trap.requires_derivation && !record.derivation) failures.push(`${record.id} carries no derivation`);
      }
      checks.push({ check: 'trap', item: trap.item, origin: trap.origin, records: records.map((record) => record.id), failures, pass: records.length > 0 && failures.length === 0 });
    }
  }

  return {
    run_id: runId,
    parent: key.parent.run_id,
    arm: key.reveal.arm,
    first_decision: { id: key.parent.decision_id, outcome: key.parent.outcome },
    second_decision: { id: decision.id, outcome: decision.outcome },
    cross_framework: key.reveal.cross_framework,
    checks,
    pass: checks.every((item) => item.pass),
  };
}

// Forks are found through their keys, never by name: the key names its parent,
// the exact version of the pair it was shown, and its replicate.
function pairVerdicts(parentId) {
  const keysDir = path.join(runsDir, '.keys');
  const children = (fs.existsSync(keysDir) ? fs.readdirSync(keysDir) : [])
    .filter((name) => name.endsWith('.json'))
    .map((name) => readJson(path.join(keysDir, name)))
    .filter((key) => key.parent?.run_id === parentId && key.reveal?.kind === 'planted')
    .map((key) => ({ name: key.fork_id, dir: path.join(runsDir, key.fork_id), key }))
    .filter(({ dir }) => fs.existsSync(path.join(dir, 'FROZEN.json')))
    .map((child) => ({ ...child, framework: readJson(path.join(child.dir, 'FROZEN.json')).framework_sha256 }));

  const groups = new Map();
  for (const child of children) {
    const groupKey = [child.key.reveal.pair_id, child.key.reveal.pair_sha256, `r${child.key.reveal.rep}`, child.framework].join('|');
    if (!groups.has(groupKey)) groups.set(groupKey, {});
    groups.get(groupKey)[child.key.reveal.side] = child;
  }

  const verdicts = [];
  for (const [groupKey, sides] of groups) {
    if (!sides.a || !sides.b) continue;
    const [pairId, pairSha256, rep, framework] = groupKey.split('|');
    for (const side of [sides.a, sides.b]) frozenOrStop(side.dir, side.name);
    const pair = parseYamlFile(path.join(sides.a.dir, 'evaluator', 'reveal-pair.yaml'), 'reveal pair').value;
    if (!pair.expect?.order) continue;
    const outcome = (child) => parseYamlFile(path.join(child.dir, 'venture', 'venture.yaml'), 'venture.yaml').value.latest_decision.outcome;
    const a = outcome(sides.a);
    const b = outcome(sides.b);
    const expectedHigher = pair.expect.order === 'a<b' ? 'b' : 'a';
    const difference = expectedHigher === 'b' ? gateRank[b] - gateRank[a] : gateRank[a] - gateRank[b];
    verdicts.push({
      pair: pairId,
      pair_sha256: pairSha256,
      rep,
      framework_sha256: framework,
      runs: { a: sides.a.name, b: sides.b.name },
      outcomes: { a, b },
      expected: pair.expect.order,
      result: difference > 0 ? 'ordered' : difference === 0 ? 'tied' : 'inverted',
    });
  }
  return verdicts;
}

if (!fs.existsSync(runDir)) {
  console.error(`Eval run not found: ${runId}`);
  process.exit(1);
}
const marker = frozenOrStop(runDir, runId);
const forkKey = readForkKey(runsDir, runId);

if (forkKey) {
  const verdict = { tool, frozen_sha256: marker.sha256, ...childVerdict(runDir, runId, forkKey) };
  writeScore(runDir, 'mechanical.json', verdict);
  for (const item of verdict.checks) console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.check}${item.item ? ` ${item.item}` : ''}`);
  console.log(`${runId}: ${verdict.pass ? 'PASS' : 'FAIL'} (${verdict.first_decision.outcome} -> ${verdict.second_decision.outcome})`);
} else {
  const pairs = pairVerdicts(runId);
  writeScore(runDir, 'pairs.json', { tool, frozen_sha256: marker.sha256, run_id: runId, pairs });
  if (!pairs.length) console.log(`${runId}: no frozen forks form a complete pair yet.`);
  for (const item of pairs) console.log(`${item.pair} ${item.rep}: ${item.result} (a=${item.outcomes.a}, b=${item.outcomes.b}, expected ${item.expected})`);
}
