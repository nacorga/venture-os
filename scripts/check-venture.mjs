import fs from 'node:fs';
import path from 'node:path';
import { validateVentureFile } from './venture-utils.mjs';

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
  const result = validateVentureFile(statePath);
  if (!result.valid) {
    for (const error of result.errors) console.error(`venture.yaml ${error}`);
    ok = false;
  } else if (result.value.slug !== slug) {
    console.error(`venture.yaml slug '${result.value.slug}' does not match directory '${slug}'`);
    ok = false;
  }
}

if (!ok) process.exit(1);
console.log(`ventures/${slug}: structure and schema OK`);
