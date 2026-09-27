import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { inheritEvidence, ventureSkeleton } from './venture-utils.mjs';

let args;
try {
  args = parseArgs({ allowPositionals: true, options: { from: { type: 'string' } } });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const [slug, ...ideaParts] = args.positionals;
const idea = ideaParts.join(' ').trim();

if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('Usage: npm run venture:new -- <slug> "<idea>" [--from <parent-venture-dir>]');
  console.error('Slug must contain only lowercase letters, numbers and hyphens.');
  process.exit(1);
}

const root = process.cwd();
const dir = path.join(root, 'ventures', slug);
if (fs.existsSync(dir)) {
  console.error(`Venture already exists: ventures/${slug}`);
  process.exit(1);
}

let evidence = [];
if (args.values.from) {
  const parentDir = path.resolve(root, args.values.from);
  try {
    evidence = inheritEvidence(parentDir, path.relative(root, parentDir));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

for (const sub of ['research', 'decisions', 'experiments', 'learning']) {
  fs.mkdirSync(path.join(dir, sub), { recursive: true });
}

const now = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(dir, 'venture.yaml'), ventureSkeleton({ slug, idea, date: now, evidence }));
fs.writeFileSync(path.join(dir, 'README.md'), `# ${slug}\n\nOriginal idea: ${idea || '(not provided)'}\n`);

console.log(`Created ventures/${slug}`);
if (evidence.length) console.log(`Inherited ${evidence.length} evidence records from ${args.values.from}`);
console.log(`Next in Claude Code: /venture-new ventures/${slug}`);
