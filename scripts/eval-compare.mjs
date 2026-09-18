import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { hashPathSet, verifyFrozenRun } from './eval-provenance.mjs';
import { readForkKey } from './reveal-utils.mjs';
import { parseYamlSource } from './venture-utils.mjs';

// Blind pairwise comparison of two frozen runs of the same case. The build step
// copies both runs' artifacts under neutral names X and Y and seals which is
// which; a judge prefers X, Y or neither per behavior without knowing the
// model, the framework or the order; unblinding maps the judgments back.
// Evaluator-side: it is not part of the hashed runtime.

export const comparedBehaviors = [
  ['critical_uncertainties', 'Which run identifies, ranks and states a falsifying condition for the uncertainties that would end or redirect the venture?'],
  ['alternatives', 'Which run finds the real alternatives — manual, do-nothing and free native options included — and says which one is the real competitor?'],
  ['facts_vs_assumptions', 'Which run keeps facts, labeled inferences and assumptions apart, discloses its derivations, and keeps evidence inside the segment it speaks for?'],
  ['disconfirming_evidence', 'Which run searched harder for evidence against its thesis, and let what it found change a status, a ranking or the decision?'],
  ['market_size_proxies', 'Which run is further from treating market size, growth or search volume as demand for this product?'],
  ['scope_restraint', 'Which run proposes less before its blocking uncertainty is resolved, and names what not to build more specifically?'],
  ['experiment_quality', 'Where the gate is TEST, which run locked the cheaper credible test of its blocker — behavior over stated preference, signals that one result cannot satisfy both ways, proportionate caps?'],
  ['uncertainty_preserved', 'Which run keeps unknowns unknown — no status upgraded without evidence, gaps recorded as gaps, strength matching the evidence class?'],
  ['decision_justification', 'Given only what each run gathered, which run reached the decision its own evidence supports better?'],
];

const toolFiles = ['scripts/eval-compare.mjs', 'scripts/eval-provenance.mjs', 'scripts/reveal-utils.mjs', 'scripts/venture-utils.mjs'];

function stop(message) {
  console.error(message);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function commitment(assignment, nonce) {
  return crypto.createHash('sha256').update(JSON.stringify(assignment) + nonce).digest('hex');
}

function compareRubric(id) {
  const items = comparedBehaviors.map(([key, question], index) => `${index + 1}. \`${key}\` — ${question}`).join('\n');
  const block = comparedBehaviors.map(([key]) => `  ${key}: <X|Y|tie>`).join('\n');
  return `# Pairwise comparison ${id}\n\nTwo frozen runs of the same case, \`X/\` and \`Y/\`, and the case they both started from, \`case.yaml\`. Which run is which — the model, the framework version and the order they ran in — is sealed until unblinding. Judge the work, not a guess about its source.\n\nFor each behavior, prefer the run that handles it better and quote the passage from each run that decides it. Answer \`tie\` only when you cannot quote a difference that matters. A preference is not a score: two excellent runs still have a better one when a difference can be quoted.\n\n${items}\n\nThen an overall preference: which run would you rather act on.\n\nEvery judgment file carries this block, verbatim in shape:\n\n\`\`\`text\n<!-- venture-os-compare:start -->\ncompare: ${id}\njudge: <judge-label>\npreferences:\n${block}\noverall: <X|Y|tie>\n<!-- venture-os-compare:end -->\n\`\`\`\n`;
}

function copyRunArtifacts(runDir, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of ['RESULT.md', 'RESULT.phase1.md', 'reveal', 'venture']) {
    const source = path.join(runDir, entry);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(target, entry), { recursive: true });
  }
}

function build(root, runA, runB) {
  const runsDir = path.join(root, 'evals', 'runs');
  const runs = [runA, runB].map((id) => {
    if (!id || id.includes('/') || id.includes('..')) stop('Usage: npm run eval:compare -- <run-a> <run-b>');
    const dir = path.join(runsDir, id);
    if (!fs.existsSync(dir)) stop(`Eval run not found: ${id}`);
    const verified = verifyFrozenRun(dir);
    if (!verified.ok) stop(`Cannot compare ${id}: it is not a verified frozen run.`);
    return { id, dir, marker: verified.marker, metadata: readJson(path.join(dir, 'metadata.json')) };
  });
  if (runA === runB) stop('Cannot compare a run with itself.');
  if (runs[0].metadata.case !== runs[1].metadata.case) stop('Cannot compare runs of different cases.');
  const armOf = (run) => readForkKey(runsDir, run.id)?.reveal.arm ?? null;
  if (armOf(runs[0]) !== armOf(runs[1])) stop('Cannot compare a first phase with a fork, or forks of different arms.');

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const id = `cmp-${stamp}-${runs[0].metadata.case}`;
  const compareDir = path.join(root, 'evals', 'compare', id);
  if (fs.existsSync(compareDir)) stop(`Comparison already exists: ${id}`);

  const swap = crypto.randomInt(2) === 1;
  const [x, y] = swap ? [runs[1], runs[0]] : runs;
  const assignment = { X: x.id, Y: y.id };
  const nonce = crypto.randomBytes(16).toString('hex');

  fs.mkdirSync(path.join(compareDir, 'judgments'), { recursive: true });
  fs.copyFileSync(path.join(x.dir, 'case.yaml'), path.join(compareDir, 'case.yaml'));
  copyRunArtifacts(x.dir, path.join(compareDir, 'X'));
  copyRunArtifacts(y.dir, path.join(compareDir, 'Y'));
  fs.writeFileSync(path.join(compareDir, 'compare.md'), compareRubric(id));
  const frameworks = [x.marker.framework_sha256, y.marker.framework_sha256];
  fs.writeFileSync(path.join(compareDir, 'manifest.json'), JSON.stringify({
    id,
    case: runs[0].metadata.case,
    arm: armOf(runs[0]),
    created_at: new Date().toISOString(),
    same_framework: frameworks[0] === frameworks[1],
    commitment: commitment(assignment, nonce),
    tool: { sha256: hashPathSet(root, toolFiles).sha256 },
  }, null, 2) + '\n');

  const keysDir = path.join(root, 'evals', 'compare', '.keys');
  fs.mkdirSync(keysDir, { recursive: true });
  fs.writeFileSync(path.join(keysDir, `${id}.json`), JSON.stringify({
    id,
    nonce,
    assignment,
    frozen_sha256: { X: x.marker.sha256, Y: y.marker.sha256 },
    framework_sha256: { X: frameworks[0], Y: frameworks[1] },
  }, null, 2) + '\n');

  console.log(`Created evals/compare/${id}`);
  console.log(`Judge it in a fresh Claude Code session per judge: /eval-compare ${id} <judge-label>`);
  console.log(`Then, outside any judge session: npm run eval:compare -- --unblind ${id}`);
}

export function parseJudgment(source) {
  const match = /<!-- venture-os-compare:start -->\n([\s\S]*?)<!-- venture-os-compare:end -->/.exec(source);
  if (!match) return { valid: false, errors: ['no venture-os-compare block'] };
  const parsed = parseYamlSource(match[1], 'comparison block');
  if (!parsed.valid) return parsed;
  const errors = [];
  const value = parsed.value;
  for (const [key] of comparedBehaviors) {
    if (!['X', 'Y', 'tie'].includes(value.preferences?.[key])) errors.push(`preferences.${key} must be X, Y or tie`);
  }
  if (!['X', 'Y', 'tie'].includes(value.overall)) errors.push('overall must be X, Y or tie');
  return { valid: errors.length === 0, value, errors };
}

function unblind(root, id) {
  if (!id || id.includes('/') || id.includes('..')) stop('Usage: npm run eval:compare -- --unblind <compare-id>');
  const compareDir = path.join(root, 'evals', 'compare', id);
  const keyPath = path.join(root, 'evals', 'compare', '.keys', `${id}.json`);
  if (!fs.existsSync(compareDir) || !fs.existsSync(keyPath)) stop(`Comparison not found: ${id}`);
  const manifest = readJson(path.join(compareDir, 'manifest.json'));
  const key = readJson(keyPath);
  if (commitment(key.assignment, key.nonce) !== manifest.commitment) stop(`The key for ${id} does not match its sealed commitment.`);

  for (const [label, runId] of Object.entries(key.assignment)) {
    const verified = verifyFrozenRun(path.join(root, 'evals', 'runs', runId));
    if (!verified.ok || verified.marker.sha256 !== key.frozen_sha256[label]) stop(`Run ${runId} changed after the comparison was built.`);
  }

  const judgmentsDir = path.join(compareDir, 'judgments');
  const judgments = [];
  for (const name of fs.readdirSync(judgmentsDir).filter((entry) => entry.endsWith('.md')).sort()) {
    const parsed = parseJudgment(fs.readFileSync(path.join(judgmentsDir, name), 'utf8'));
    if (!parsed.valid) stop(`judgments/${name}: ${parsed.errors.join('; ')}`);
    const toRun = (choice) => (choice === 'tie' ? 'tie' : key.assignment[choice]);
    judgments.push({
      judge: parsed.value.judge ?? name.slice(0, -3),
      preferences: Object.fromEntries(Object.entries(parsed.value.preferences).map(([item, choice]) => [item, toRun(choice)])),
      overall: toRun(parsed.value.overall),
    });
  }
  if (!judgments.length) stop(`No judgments yet under evals/compare/${id}/judgments/.`);

  const runsCompared = Object.values(key.assignment);
  const overall = Object.fromEntries([...runsCompared, 'tie'].map((run) => [run, judgments.filter((item) => item.overall === run).length]));
  const result = {
    id,
    case: manifest.case,
    arm: manifest.arm,
    runs: runsCompared,
    framework_sha256: Object.fromEntries(Object.entries(key.assignment).map(([label, runId]) => [runId, key.framework_sha256[label]])),
    same_framework: manifest.same_framework,
    judgments,
    overall,
  };
  fs.writeFileSync(path.join(compareDir, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`${id}: ${runsCompared.map((run) => `${run} ${overall[run]}`).join(', ')}, tie ${overall.tie}`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  let args;
  try {
    args = parseArgs({ allowPositionals: true, options: { unblind: { type: 'string' } } });
  } catch (error) {
    stop(error.message);
  }
  const root = process.cwd();
  if (args.values.unblind) unblind(root, args.values.unblind);
  else build(root, ...args.positionals);
}
