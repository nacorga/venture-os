import fs from 'node:fs';
import path from 'node:path';
import { casesRoot, validateCaseFile } from './case-utils.mjs';
import {
  evaluatorContext,
  frameworkHash,
  gitState,
  sha256File,
} from './eval-provenance.mjs';

const [caseName, modelLabel = 'manual'] = process.argv.slice(2);

if (!caseName || !/^[a-z0-9-]+$/.test(caseName)) {
  console.error('Usage: npm run eval:new -- <case> [model-label]');
  process.exit(1);
}

if (!/^[a-zA-Z0-9._-]+$/.test(modelLabel)) {
  console.error('Model label may contain only letters, numbers, dots, underscores and hyphens.');
  process.exit(1);
}

const root = process.cwd();
const casePath = path.join(casesRoot, caseName, 'case.yaml');
if (!fs.existsSync(casePath)) {
  console.error(`Unknown case: ${caseName}`);
  process.exit(1);
}

const caseResult = validateCaseFile(casePath);
if (!caseResult.valid) {
  console.error(`Invalid case: ${caseName}`);
  for (const error of caseResult.errors) console.error(`  - ${error}`);
  process.exit(1);
}

const caseContent = fs.readFileSync(casePath, 'utf8');
const input = caseResult.value.statement;

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const runId = `${stamp}-${caseName}-${modelLabel}`;
const runDir = path.join(root, 'evals', 'runs', runId);
const ventureDir = path.join(runDir, 'venture');

for (const sub of ['research', 'decisions', 'experiments', 'learning']) {
  fs.mkdirSync(path.join(ventureDir, sub), { recursive: true });
}

const git = gitState(root);
const evaluator = evaluatorContext(root, caseName);
const provenance = {
  creation_commit: git.commit,
  creation_working_tree_dirty: git.working_tree_dirty,
  framework_sha256: frameworkHash(root),
  case_sha256: sha256File(casePath),
  rubric_sha256: evaluator.rubric_sha256,
  reference_sha256: evaluator.reference_sha256,
};

fs.writeFileSync(path.join(runDir, 'case.yaml'), caseContent);
fs.writeFileSync(
  path.join(runDir, 'metadata.json'),
  JSON.stringify({
    run_id: runId,
    case: caseName,
    case_schema_version: caseResult.value.schema_version,
    model_label: modelLabel,
    created_at: new Date().toISOString(),
    commit: git.commit,
    provenance,
    status: 'CREATED',
  }, null, 2) + '\n'
);

const prompt = `# Eval Run: ${caseName}\n\nSeed idea:\n\n> ${input}\n\n## Canonical workflow\n\nOperational instructions live in Claude Code skills. This file intentionally does not duplicate them.\n\n1. Start a fresh Claude Code session and run:\n\n   \`/eval-run ${runId}\`\n\n2. When that skill completes, run:\n\n   \`/eval-freeze ${runId}\`\n\n3. Open another fresh Claude Code session and run:\n\n   \`/eval-score ${runId}\`\n\nIf any procedure differs between this file and a skill, the skill is authoritative.\n`;
fs.writeFileSync(path.join(runDir, 'RUN.md'), prompt);

console.log(`Created evals/runs/${runId}`);
console.log(`Framework sha256: ${provenance.framework_sha256}`);
console.log(`Fresh Claude Code session: /eval-run ${runId}`);
