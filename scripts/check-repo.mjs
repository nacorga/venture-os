import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { listCaseFiles, validateCaseFile } from './case-utils.mjs';
import { validateRevealPairFile } from './reveal-utils.mjs';

const root = process.cwd();
let errors = 0;

function fail(message) {
  console.error(`ERROR: ${message}`);
  errors += 1;
}

const expected = [
  'CLAUDE.md',
  '.nvmrc',
  'package-lock.json',
  '.claude/agents',
  '.claude/skills',
  '.github/dependabot.yml',
  '.github/workflows/prepare-release.yml',
  '.github/workflows/release.yml',
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
  'evals/RUBRIC.md',
  'cases',
  'cases/README.md',
  'docs/WORKFLOWS.md',
  'docs/QUICKSTART.md',
  'docs/FEEDBACK.md',
  'docs/LAUNCH_CHECKLIST.md',
  'docs/CASE_FORMAT.md',
  'docs/CASE_PUBLISHING.md',
  'docs/PUBLICATION.md',
  'scripts/case-utils.mjs',
  'scripts/new-case.mjs',
  'scripts/validate-case.mjs',
  'scripts/eval-suite.mjs',
  'scripts/fork-eval-run.mjs',
  'scripts/reveal-utils.mjs',
  'scripts/eval-verdict.mjs',
  'scripts/eval-compare.mjs',
  'scripts/eval-summary.mjs',
  'scripts/eval-batch.mjs',
  'evals/schemas/reveal-pair.schema.json',
  'test/contracts.test.mjs'
];
for (const p of expected) if (!fs.existsSync(path.join(root, p))) fail(`Missing ${p}`);

if (fs.existsSync(path.join(root, 'evals', 'golden'))) {
  fail('evals/golden must not exist; public case input is canonical under cases/<id>/case.yaml');
}

const readmePath = path.join(root, 'README.md');
if (fs.existsSync(readmePath)) {
  const readme = fs.readFileSync(readmePath, 'utf8');
  for (const requiredLink of ['docs/QUICKSTART.md', 'docs/FEEDBACK.md', 'docs/LAUNCH_CHECKLIST.md', 'docs/PUBLICATION.md', 'CONTRIBUTING.md']) {
    if (!readme.includes(requiredLink)) fail(`README.md missing launch/onboarding link: ${requiredLink}`);
  }
  if (!readme.includes('## Release status')) {
    fail('README.md must describe the current public release state');
  }
  if (!readme.includes('sanitized root history')) {
    fail('README.md must preserve the sanitized-history boundary');
  }
  if (!readme.includes('PROCEED') || !readme.includes('TEST') || !readme.includes('PARK')) {
    fail('README.md must document all canonical gate outcomes');
  }
  if (readme.includes('or a reframed thesis')) {
    fail('README.md must not describe thesis reframing as a fourth gate outcome');
  }
  if (!readme.includes('Node.js 24+')) {
    fail('README.md must document Node.js 24+ as the supported runtime');
  }
  if (!readme.includes('npm ci')) {
    fail('README.md must use the reproducible npm ci install path');
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
let pkg = null;
if (fs.existsSync(packagePath)) {
  try {
    pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pkg.version ?? '')) {
      fail('package.json version must be a stable semantic version');
    }
    if (pkg.private !== true) fail('package.json must remain private; releases are distributed through GitHub');
    if (pkg.scripts?.test !== 'node --test') fail('package.json must expose the deterministic node --test suite');
    if (pkg.scripts?.['case:new'] !== 'node scripts/new-case.mjs') fail('package.json missing canonical case:new script');
    if (pkg.scripts?.['case:validate'] !== 'node scripts/validate-case.mjs') fail('package.json missing canonical case:validate script');
    if (pkg.engines?.node !== '>=24') fail('package.json must require Node.js >=24');
    for (const dependency of ['ajv', 'ajv-formats', 'yaml']) {
      if (!pkg.dependencies?.[dependency]) fail(`package.json missing case tooling dependency: ${dependency}`);
    }
  } catch (error) {
    fail(`Invalid package.json: ${error.message}`);
  }
}

const lockPath = path.join(root, 'package-lock.json');
if (fs.existsSync(lockPath) && pkg) {
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (lock.lockfileVersion !== 3) fail('package-lock.json must use lockfileVersion 3');
    if (lock.version !== pkg.version) fail('package-lock.json version must match package.json');
    const rootPackage = lock.packages?.[''];
    if (!rootPackage) fail('package-lock.json missing root package metadata');
    else {
      if (rootPackage.version !== pkg.version) fail('package-lock.json root version must match package.json');
      if (rootPackage.engines?.node !== pkg.engines?.node) fail('package-lock.json Node engine must match package.json');
      for (const dependency of ['ajv', 'ajv-formats', 'yaml']) {
        if (rootPackage.dependencies?.[dependency] !== pkg.dependencies?.[dependency]) {
          fail(`package-lock.json dependency ${dependency} must match package.json`);
        }
      }
    }
  } catch (error) {
    fail(`Invalid package-lock.json: ${error.message}`);
  }
}

const nvmrcPath = path.join(root, '.nvmrc');
if (fs.existsSync(nvmrcPath) && fs.readFileSync(nvmrcPath, 'utf8').trim() !== '24') {
  fail('.nvmrc must pin Node 24');
}

const workflowPath = path.join(root, '.github', 'workflows', 'validate.yml');
if (fs.existsSync(workflowPath)) {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  if (!workflow.includes('workflow_dispatch:')) fail('Validate workflow must support a manual run');
  // A pull request's required check is satisfied only by a run of the
  // pull_request event. A dispatched run on the same commit is not counted, so
  // skipping package-only pull requests left every version pull request
  // blocked on a check that never arrived.
  if (workflow.includes('paths-ignore:')) fail('Validate workflow must run on every pull request, version pull requests included');
  if (!workflow.includes('persist-credentials: false')) fail('Validate workflow must not persist Git credentials');
  for (const pinnedAction of [
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
    'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7',
  ]) {
    if (!workflow.includes(pinnedAction)) fail(`Validate workflow must pin reviewed action: ${pinnedAction}`);
  }
  if (!workflow.includes('node-version: 24')) fail('Validate workflow must run on Node 24');
  if (!workflow.includes('npm ci --ignore-scripts --no-audit --no-fund')) fail('Validate workflow must install from package-lock with npm ci');
  if (!workflow.includes('run: npm test')) fail('Validate workflow must run deterministic tests');
  if (workflow.includes('npm install --no-package-lock')) fail('Validate workflow must not bypass package-lock');
}

const prepareReleaseWorkflowPath = path.join(root, '.github', 'workflows', 'prepare-release.yml');
if (fs.existsSync(prepareReleaseWorkflowPath)) {
  const workflow = fs.readFileSync(prepareReleaseWorkflowPath, 'utf8');
  const requiredFragments = [
    'name: Prepare release',
    'workflow_dispatch:',
    'version_type:',
    'type: choice',
    '- patch',
    '- minor',
    '- major',
    'patch|minor|major',
    'contents: read',
    'contents: write',
    'pull-requests: write',
    'group: release',
    "github.ref != 'refs/heads/main'",
    'fetch-depth: 0',
    'persist-credentials: false',
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
    'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7',
    'node-version: 24',
    'npm ci --ignore-scripts --no-audit --no-fund',
    'run: npm test',
    'run: npm run repo:check',
    'run: npm run case:validate',
    'npm run venture:new -- release-smoke',
    'npm run venture:check -- release-smoke',
    'npm run eval:new -- inventory-monitoring-saas release-smoke',
    'npm version "$VERSION_TYPE" --no-git-tag-version --ignore-scripts',
    'BRANCH="release/v${VERSION}"',
    'gh pr create',
    'Approve and run workflows',
    '## Next step',
    'No second manual workflow run is needed',
  ];
  for (const fragment of requiredFragments) {
    if (!workflow.includes(fragment)) fail(`Prepare release workflow missing required control: ${fragment}`);
  }
  for (const forbiddenFragment of ['npm publish', 'packages: write', 'id-token: write', 'skip_tests', 'git push origin main', 'gh release create', 'gh workflow run validate.yml', 'actions: write']) {
    if (workflow.includes(forbiddenFragment)) fail(`Prepare release workflow must not contain: ${forbiddenFragment}`);
  }
}

const releaseWorkflowPath = path.join(root, '.github', 'workflows', 'release.yml');
if (fs.existsSync(releaseWorkflowPath)) {
  const workflow = fs.readFileSync(releaseWorkflowPath, 'utf8');
  const requiredFragments = [
    'name: Publish release',
    'push:',
    '- main',
    '- package.json',
    '- package-lock.json',
    'contents: read',
    'contents: write',
    'group: release',
    'fetch-depth: 0',
    'persist-credentials: false',
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
    'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7',
    'node-version: 24',
    'npm ci --ignore-scripts --no-audit --no-fund',
    'run: npm test',
    'run: npm run repo:check',
    'run: npm run case:validate',
    'npm run venture:new -- release-smoke',
    'npm run venture:check -- release-smoke',
    'npm run eval:new -- inventory-monitoring-saas release-smoke',
    'gh release create',
    'needs: validate_release',
    '--target "$GITHUB_SHA"',
    '--generate-notes',
    '--fail-on-no-commits',
  ];
  for (const fragment of requiredFragments) {
    if (!workflow.includes(fragment)) fail(`Publish release workflow missing required control: ${fragment}`);
  }
  for (const forbiddenFragment of ['workflow_dispatch:', 'npm publish', 'packages: write', 'id-token: write', 'skip_tests', 'git push origin main', 'gh pr create']) {
    if (workflow.includes(forbiddenFragment)) fail(`Publish release workflow must not contain: ${forbiddenFragment}`);
  }
}

const dependabotPath = path.join(root, '.github', 'dependabot.yml');
if (fs.existsSync(dependabotPath)) {
  const dependabot = fs.readFileSync(dependabotPath, 'utf8');
  for (const ecosystem of ['npm', 'github-actions']) {
    if (!dependabot.includes(`package-ecosystem: ${ecosystem}`)) fail(`Dependabot must cover ${ecosystem}`);
  }
  if (!dependabot.includes('interval: weekly')) fail('Dependabot updates should run weekly');
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

  const revealDir = path.join(referenceDir, 'reveal');
  if (fs.existsSync(revealDir)) {
    for (const caseEntry of fs.readdirSync(revealDir, { withFileTypes: true })) {
      if (caseEntry.name.startsWith('.')) continue;
      if (!caseEntry.isDirectory()) {
        fail(`evals/reference/reveal/${caseEntry.name} must be a case directory`);
        continue;
      }
      if (!publicCaseIds.has(caseEntry.name)) {
        fail(`Reveal pairs under evals/reference/reveal/${caseEntry.name} have no canonical public case`);
      }
      for (const pairEntry of fs.readdirSync(path.join(revealDir, caseEntry.name), { withFileTypes: true })) {
        if (pairEntry.name.startsWith('.')) continue;
        const pairPath = path.join(revealDir, caseEntry.name, pairEntry.name);
        const result = validateRevealPairFile(pairPath, caseEntry.name);
        for (const error of result.errors) fail(`evals/reference/reveal/${caseEntry.name}/${pairEntry.name} ${error}`);
      }
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

const manualEvalSkills = ['eval-new', 'eval-run', 'eval-freeze', 'eval-continue', 'eval-score', 'eval-compare'];
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

const suiteResolver = path.join(root, 'scripts', 'eval-suite.mjs');
if (fs.existsSync(suiteResolver) && !fs.readFileSync(suiteResolver, 'utf8').includes("from './case-utils.mjs'")) {
  fail('eval-suite.mjs must validate eval inputs through Case Library utilities');
}

const evalGenerator = path.join(root, 'scripts', 'new-eval-run.mjs');
if (fs.existsSync(evalGenerator)) {
  const text = fs.readFileSync(evalGenerator, 'utf8');
  for (const command of ['/eval-run ${runId}', '/eval-freeze ${runId}', '/eval-score ${runId}']) {
    if (!text.includes(command)) fail(`new-eval-run.mjs missing canonical command: ${command}`);
  }
  if (!text.includes("from './eval-suite.mjs'")) fail('new-eval-run.mjs must source eval inputs through the suite resolver');
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
