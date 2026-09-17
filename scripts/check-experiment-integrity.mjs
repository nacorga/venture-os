import fs from 'node:fs';
import path from 'node:path';
import { validateVentureFile } from './venture-utils.mjs';
import { validateExperimentFile } from './experiment-utils.mjs';

const [target] = process.argv.slice(2);
if (!target) {
  console.error('Usage: node scripts/check-experiment-integrity.mjs <venture-dir|venture.yaml>');
  process.exit(1);
}

const root = process.cwd();
let venturePath = path.resolve(root, target);
if (fs.existsSync(venturePath) && fs.statSync(venturePath).isDirectory()) {
  venturePath = path.join(venturePath, 'venture.yaml');
}

const venture = validateVentureFile(venturePath);
if (!venture.valid) {
  for (const error of venture.errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

const ventureDir = path.dirname(venturePath);
const experimentsDir = path.join(ventureDir, 'experiments');
if (!fs.existsSync(experimentsDir)) {
  console.log('Experiment integrity OK: no experiments');
  process.exit(0);
}

let errors = 0;
const ids = new Set();
for (const entry of fs.readdirSync(experimentsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const filePath = path.join(experimentsDir, entry.name, 'experiment.yaml');
  if (!fs.existsSync(filePath)) continue;

  const result = validateExperimentFile(filePath, venture.value);
  for (const error of result.errors) {
    console.error(`ERROR: ${path.relative(root, filePath)} ${error}`);
    errors += 1;
  }
  if (!result.valid) continue;

  if (ids.has(result.value.id)) {
    console.error(`ERROR: duplicate experiment ID ${result.value.id}`);
    errors += 1;
  }
  ids.add(result.value.id);
}

if (errors) {
  console.error(`\n${errors} experiment integrity issue(s) found.`);
  process.exit(1);
}

console.log(`Experiment integrity OK: ${ids.size} experiment(s) verified.`);
