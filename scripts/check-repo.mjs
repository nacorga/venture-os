import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { listCaseFiles, validateCaseFile } from './case-utils.mjs';

const root = process.cwd();
let errors = 0;

function fail(message) {
  console.error(`ERROR: ${message}`);
  errors += 1;
}

const expected = [
  'CLAUDE.md',
  '.claude/agents',
  '.claude/skills',
  '.github/workflows/validate.yml',
  '.github/ISSUE_TEMPLATE/bug.yml',
  '.github/ISSUE_TEMPLATE/case-contribution.yml',
  '.github/ISSUE_TEMPLATE/feedback.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  'CONTRIBUTING.md',
  'framework',
  'framework/schemas/case.schema.json',
  'templates',
  'evals',
  'evals/reference',
  'cases',
  'cases/README.md',
  'docs/WORKFLOWS.md',
  'docs/QUICKSTART.md',
  'docs/FEEDBACK.md',
  'docs/LAUNCH_CHECKLIST.md',
  'docs/CASE_FORMAT.md',
  'docs/CASE_PUBLISHING.md',
  'scripts/case-utils.mjs',
  'scripts/new-case.mjs',
  'scripts/validate-case.mjs'
];
for (const p of expected) if (!fs.existsSync(path.join(root, p))) fail(`Missing ${p}`);

if (fs.existsSync(path.join(root, 'evals', 'golden'))) {
  fail('evals/golden must not exist; public case input is canonical under cases/<id>/case.yaml');
}

const readmePath = path.join(root, 'README.md');
if (fs.existsSync(readmePath)) {
  const readme = fs.readFileSync(readmePath, 'utf8');
  for (const requiredLink of ['docs/QUICKSTART.md', 'docs/FEEDBACK.md', 'docs/LAUNCH_CHECKLIST.md', 'CONTRIBUTING.md']) {
    if (!readme.includes(requiredLink)) fail(`README.md missing launch/onboarding link: ${requiredLink}`);
  }
  if (!readme.includes('Do **not** publish its existing private Git history directly')) {
    fail('README.md must preserve the pre-public sanitized-history warning');
  }
}

const caseSchemaPath = path.join(root, 'framework', 'schemas', 'case.schema.json');
if (fs.existsSync(caseSchemaPath)) {
  try {
    const schema = JSON.parse(fs.readFileSync(caseSchemaPath, 'utf8'));
    if (schema?.properties?.schema_version?.const !== 1) fail('Case schema must define schema_version const 1');
    const required = new Set(schema.required ?? []);
    for (const field of ['schema_version', 'id', 'title', 'statement', 'categories', 'tags', 'provenance']) {
      if (!required.has(field)) fail(`Case schema missing required field: ${field}`);
    }
    if (schema.additionalProperties !== false) fail('Case schema must reject unknown top-level fields');

    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    ajv.compile(schema);
  } catch (error) {
    fail(`Invalid or uncompilable case schema: ${error.message}`);
  }
}

const packagePath = path.join(root, 'package.json');
if (fs.existsSync(packagePath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (pkg.scripts?.['case:new'] !== 'node scripts/new-case.mjs') fail('package.json missing canonical case:new script');
    if (pkg.scripts?.['case:validate'] !== 'node scripts/validate-case.mjs') fail('package.json missing canonical case:validate script');
    for (const dependency of ['ajv', 'ajv-formats', 'yaml']) {
      if (!pkg.dependencies?.[dependency]) fail(`package.json missing case tooling dependency: ${dependency}`);
    }
  } catch (error) {
    fail(`Invalid package.json: ${error.message}`);
  }
}

const publicCaseFiles = listCaseFiles();
if (publicCaseFiles.length < 5) fail(`Case Library must contain at least 5 seed cases; found ${publicCaseFiles.length}`);

const publicCaseIds = new Set();
for (const filePath of publicCaseFiles) {
  const result = validateCaseFile(filePath);
  if (!result.valid) {
    for (const error of result.errors) fail(`${path.relative(root, filePath)} ${error}`);
    continue;
  }
  if (publicCaseIds.has(result.value.id)) fail(`Duplicate public case id: ${result.value.id}`);
  publicCaseIds.add(result.value.id);
}

const referenceDir = path.join(root, 'evals', 'reference');
if (fs.existsSync(referenceDir)) {
  for (const entry of fs.readdirSync(referenceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue;
    const caseId = entry.name.slice(0, -5);
    if (!publicCaseIds.has(caseId)) {
      fail(`Evaluator reference ${entry.name} has no canonical public case at cases/${caseId}/case.yaml`);
    }
  }
}

const skillsDir = path.join(root, '.claude', 'skills');
if (fs.existsSync(skillsDir)) {
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skill = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skill)) fail(`Skill ${entry.name} has no SKILL.md`);
    else {
      const text = fs.readFileSync(skill, 'utf8');
      if (!text.startsWith('---\n')) fail(`Skill ${entry.name} missing YAML frontmatter`);
      if (!text.includes(`name: ${entry.name}`)) fail(`Skill ${entry.name} frontmatter name mismatch`);
      if (!text.includes('description:')) fail(`Skill ${entry.name} missing description`);
    }
  }
}

const agentsDir = path.join(root, '.claude', 'agents');
if (fs.existsSync(agentsDir)) {
  for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const text = fs.readFileSync(path.join(agentsDir, entry.name), 'utf8');
    if (!text.startsWith('---\n')) fail(`Agent ${entry.name} missing YAML frontmatter`);
    if (!text.includes('name:')) fail(`Agent ${entry.name} missing name`);
    if (!text.includes('description:')) fail(`Agent ${entry.name} missing description`);
  }
}

const manualEvalSkills = ['eval-new', 'eval-run', 'eval-freeze', 'eval-score'];
for (const requiredSkill of manualEvalSkills) {
  const skillPath = path.join(skillsDir, requiredSkill, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    fail(`Missing ${requiredSkill} skill`);
    continue;
  }
  const text = fs.readFileSync(skillPath, 'utf8');
  if (!text.includes('argument-hint:')) fail(`${requiredSkill} must declare argument-hint`);
  if (!text.includes('disable-model-invocation: true')) fail(`${requiredSkill} must be manually invoked`);
  if (!text.includes('$ARGUMENTS')) fail(`${requiredSkill} must consume skill arguments`);
}

const ventureSkills = [
  'venture-new',
  'venture-research',
  'venture-challenge',
  'venture-decide',
  'venture-position',
  'venture-experiment',
  'venture-learn',
  'venture-status'
];
for (const skillName of ventureSkills) {
  const skillPath = path.join(skillsDir, skillName, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    fail(`Missing ${skillName} skill`);
    continue;
  }
  const text = fs.readFileSync(skillPath, 'utf8');
  if (!text.includes('argument-hint: <venture-dir>')) fail(`${skillName} must declare <venture-dir> argument`);
  if (!text.includes('$ARGUMENTS')) fail(`${skillName} must consume the venture-dir argument`);
}

const evalGenerator = path.join(root, 'scripts', 'new-eval-run.mjs');
if (fs.existsSync(evalGenerator)) {
  const text = fs.readFileSync(evalGenerator, 'utf8');
  for (const command of ['/eval-run ${runId}', '/eval-freeze ${runId}', '/eval-score ${runId}']) {
    if (!text.includes(command)) fail(`new-eval-run.mjs missing canonical command: ${command}`);
  }
  if (!text.includes("from './case-utils.mjs'")) fail('new-eval-run.mjs must source eval inputs through Case Library utilities');
  if (!text.includes('caseResult.value.statement')) fail('new-eval-run.mjs must use canonical case statement as eval seed');
  if (text.includes('evals/golden')) fail('new-eval-run.mjs must not read deprecated evals/golden inputs');
  if (text.includes('Use the eval-run skill for')) {
    fail('new-eval-run.mjs must not embed a duplicated long-form eval prompt');
  }
}

if (errors) {
  console.error(`\n${errors} issue(s) found.`);
  process.exit(1);
}
console.log('Repository structure OK');
