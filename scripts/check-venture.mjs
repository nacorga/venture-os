import fs from 'node:fs';
import path from 'node:path';

const [slug] = process.argv.slice(2);
if (!slug) {
  console.error('Usage: npm run venture:check -- <slug>');
  process.exit(1);
}

const dir = path.join(process.cwd(), 'ventures', slug);
const required = ['venture.yaml', 'research', 'decisions', 'experiments', 'learning'];
let ok = true;
for (const name of required) {
  if (!fs.existsSync(path.join(dir, name))) {
    console.error(`Missing: ventures/${slug}/${name}`);
    ok = false;
  }
}

const statePath = path.join(dir, 'venture.yaml');
if (fs.existsSync(statePath)) {
  const text = fs.readFileSync(statePath, 'utf8');
  for (const key of ['version:', 'stage:', 'thesis:', 'assumptions:', 'evidence_index:', 'next_action:']) {
    if (!text.includes(key)) {
      console.error(`venture.yaml missing key: ${key}`);
      ok = false;
    }
  }
}

if (!ok) process.exit(1);
console.log(`ventures/${slug}: basic structure OK`);
