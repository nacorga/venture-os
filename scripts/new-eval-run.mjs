import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { resolveSuite, validateSuiteCase } from './eval-suite.mjs';
import {
  evaluatorSourceHashes,
  gitProvenance,
  runtimeProvenance,
  sha256File,
} from './eval-provenance.mjs';

let args;
try {
  args = parseArgs({ allowPositionals: true, options: { suite: { type: 'string' } } });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const [caseName, modelLabel = 'manual'] = args.positionals;

if (!caseName || !/^[a-z0-9-]+$/.test(caseName)) {
  console.error('Usage: npm run eval:new -- <case> [model-label] [--suite <path>]');
  process.exit(1);
}

if (!/^[a-zA-Z0-9._-]+$/.test(modelLabel)) {
  console.error('Model label may contain only letters, numbers, dots, underscores and hyphens.');
  process.exit(1);
}

const root = process.cwd();
let suite;
try {
  suite = resolveSuite(root, args.values.suite);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const caseResult = validateSuiteCase(suite, caseName);
if (!caseResult.valid) {
  console.error(`Invalid case: ${caseName}`);
  for (const error of caseResult.errors) console.error(`  - ${error}`);
  process.exit(1);
}

const casePath = caseResult.casePath;
const caseContent = fs.readFileSync(casePath, 'utf8');
const input = caseResult.value.statement;

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const runId = `${stamp}-${caseName}-${modelLabel}`;
const runDir = path.join(root, 'evals', 'runs', runId);
const ventureDir = path.join(runDir, 'venture');
if (fs.existsSync(runDir)) {
  console.error(`Eval run already exists: ${runId}. Run IDs have one-second resolution; wait a second or use another model label.`);
  process.exit(1);
}

for (const sub of ['research', 'decisions', 'experiments', 'learning']) {
  fs.mkdirSync(path.join(ventureDir, sub), { recursive: true });
}

const git = gitProvenance(root);
const runtime = runtimeProvenance(root);
const evaluatorSources = evaluatorSourceHashes(root, caseName, suite.referenceDir);

fs.writeFileSync(path.join(runDir, 'case.yaml'), caseContent);
fs.writeFileSync(
  path.join(runDir, 'metadata.json'),
  JSON.stringify({
    run_id: runId,
    case: caseName,
    case_schema_version: caseResult.value.schema_version,
    model_label: modelLabel,
    ...(suite.label ? { suite: { label: suite.label } } : {}),
    created_at: new Date().toISOString(),
    commit: git.commit,
    status: 'CREATED',
    provenance: {
      git,
      case_sha256: sha256File(casePath),
      ...runtime,
      evaluator_sources: evaluatorSources,
    },
  }, null, 2) + '\n'
);

const suiteNote = suite.label ? ' --suite <path to the suite this run was created from>' : '';
const prompt = `# Eval Run: ${caseName}\n\nSeed idea:\n\n> ${input}\n\n## Canonical workflow\n\nOperational instructions live in Claude Code skills. This file intentionally does not duplicate them.\n\n1. Start a fresh Claude Code session and run:\n\n   \`/eval-run ${runId}\`\n\n2. When that skill completes, run:\n\n   \`/eval-freeze ${runId}${suiteNote}\`\n\n3. For each independent judge, open another fresh Claude Code session and run:\n\n   \`/eval-score ${runId} <judge-label>\`\n\nIf any procedure differs between this file and a skill, the skill is authoritative.\n`;
fs.writeFileSync(path.join(runDir, 'RUN.md'), prompt);

console.log(`Created evals/runs/${runId}`);
console.log(`Framework sha256: ${runtime.framework_sha256}`);
if (suite.label) console.log(`Suite: ${suite.label}`);
if (git.dirty) console.log('Note: git worktree is dirty; effective runtime hash is recorded in metadata.json.');
console.log(`Fresh Claude Code session: /eval-run ${runId}`);
