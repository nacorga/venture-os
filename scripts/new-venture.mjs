import fs from 'node:fs';
import path from 'node:path';

const [slug, ...ideaParts] = process.argv.slice(2);
const idea = ideaParts.join(' ').trim();

if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('Usage: npm run venture:new -- <slug> "<idea>"');
  console.error('Slug must contain only lowercase letters, numbers and hyphens.');
  process.exit(1);
}

const root = process.cwd();
const dir = path.join(root, 'ventures', slug);
if (fs.existsSync(dir)) {
  console.error(`Venture already exists: ventures/${slug}`);
  process.exit(1);
}

for (const sub of ['research', 'decisions', 'experiments', 'learning']) {
  fs.mkdirSync(path.join(dir, sub), { recursive: true });
}

const now = new Date().toISOString().slice(0, 10);
const yaml = `version: 2
name: "${slug.replaceAll('-', ' ')}"
slug: "${slug}"
created_at: "${now}"
updated_at: "${now}"
stage: concept

idea: ${JSON.stringify(idea)}

thesis:
  problem: ""
  icp: ""
  solution: ""
  business_model: ""
  distribution: ""

alternatives: []
assumptions: []
risks: []
evidence_index: []

latest_decision:
  id: null
  outcome: null
  path: null
  snapshot: null

blocking_assumptions: []
blocking_deferrals: []
do_not_build: []
next_action:
  id: N001
  type: normalize
  assumption_id: null
  instruction: "Normalize this idea into explicit critical assumptions before research."
  success_signal: null
  failure_signal: null
  depends_on: []
revisit_when: []
reopen_combination_rule: null
`;
fs.writeFileSync(path.join(dir, 'venture.yaml'), yaml);
fs.writeFileSync(path.join(dir, 'README.md'), `# ${slug}\n\nOriginal idea: ${idea || '(not provided)'}\n`);

console.log(`Created ventures/${slug}`);
console.log(`Next in Claude Code: /venture-new ventures/${slug}`);
