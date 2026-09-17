import fs from 'node:fs';
import path from 'node:path';
import { listExperimentFiles, experimentPreregistrationErrors, validateExperimentFile } from './experiment-utils.mjs';
import { validateVentureFile } from './venture-utils.mjs';

const [target] = process.argv.slice(2);
if (!target) {
  console.error('Usage: node scripts/check-experiment-consistency.mjs <venture-dir|venture.yaml>');
  process.exit(1);
}

const root = process.cwd();
let statePath = path.resolve(root, target);
if (fs.existsSync(statePath) && fs.statSync(statePath).isDirectory()) {
  statePath = path.join(statePath, 'venture.yaml');
}
if (!fs.existsSync(statePath)) {
  console.error(`venture.yaml not found: ${path.relative(root, statePath)}`);
  process.exit(1);
}

const ventureResult = validateVentureFile(statePath);
if (!ventureResult.valid) {
  for (const error of ventureResult.errors) console.error(`ERROR: venture.yaml ${error}`);
  process.exit(1);
}

const ventureDir = path.dirname(statePath);
const assumptionIds = new Set((ventureResult.value.assumptions ?? []).map((item) => item.id));
const evidenceIds = new Set((ventureResult.value.evidence_index ?? []).map((item) => item.id));
const experimentIds = new Set();
let errors = 0;

function fail(message) {
  console.error(`ERROR: ${message}`);
  errors += 1;
}

for (const filePath of listExperimentFiles(ventureDir)) {
  const relative = path.relative(root, filePath);
  const result = validateExperimentFile(filePath);
  if (!result.valid) {
    for (const error of result.errors) fail(`${relative} ${error}`);
    continue;
  }

  const experiment = result.value;
  if (experimentIds.has(experiment.id)) fail(`Duplicate experiment ID ${experiment.id}`);
  experimentIds.add(experiment.id);

  if (!assumptionIds.has(experiment.primary_assumption_id)) {
    fail(`${experiment.id} references missing assumption ${experiment.primary_assumption_id}`);
  }

  for (const evidenceId of experiment.results?.evidence_ids ?? []) {
    if (!evidenceIds.has(evidenceId)) fail(`${experiment.id} results reference missing evidence ${evidenceId}`);
  }

  for (const error of experimentPreregistrationErrors(experiment)) fail(error);
}

if (errors) {
  console.error(`\n${errors} experiment consistency issue(s) found.`);
  process.exit(1);
}

console.log(`Experiment consistency OK: ${path.relative(root, ventureDir)}`);
console.log(`Verified ${experimentIds.size} experiment(s).`);
