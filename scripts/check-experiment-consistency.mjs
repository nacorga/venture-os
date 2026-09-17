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
const venture = ventureResult.value;
const assumptionIds = new Set((venture.assumptions ?? []).map((item) => item.id));
const evidenceIds = new Set((venture.evidence_index ?? []).map((item) => item.id));
const experiments = new Map();
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
  if (experiments.has(experiment.id)) fail(`Duplicate experiment ID ${experiment.id}`);
  experiments.set(experiment.id, experiment);

  if (!assumptionIds.has(experiment.primary_assumption_id)) {
    fail(`${experiment.id} references missing assumption ${experiment.primary_assumption_id}`);
  }

  for (const evidenceId of experiment.results?.evidence_ids ?? []) {
    if (!evidenceIds.has(evidenceId)) fail(`${experiment.id} results reference missing evidence ${evidenceId}`);
  }

  for (const error of experimentPreregistrationErrors(experiment)) fail(error);
}

const nextAction = venture.next_action;
if (nextAction && typeof nextAction === 'object' && !Array.isArray(nextAction) && nextAction.experiment_id) {
  if (!/^X[0-9]{3,}$/.test(nextAction.experiment_id)) {
    fail(`next_action.experiment_id ${nextAction.experiment_id} is not a stable X### ID`);
  } else if (!experiments.has(nextAction.experiment_id)) {
    fail(`next_action references missing experiment ${nextAction.experiment_id}`);
  } else {
    const experiment = experiments.get(nextAction.experiment_id);
    if (nextAction.type !== 'experiment') {
      fail(`next_action references ${nextAction.experiment_id} but type is ${nextAction.type}, not experiment`);
    }
    if (nextAction.assumption_id !== experiment.primary_assumption_id) {
      fail(`next_action assumption ${nextAction.assumption_id ?? 'null'} does not match ${nextAction.experiment_id} primary assumption ${experiment.primary_assumption_id}`);
    }
    if (nextAction.success_signal !== null || nextAction.failure_signal !== null) {
      fail(`next_action linked to ${nextAction.experiment_id} must keep success_signal/failure_signal null; preregistered criteria live in experiment.yaml`);
    }
  }
}

if (errors) {
  console.error(`\n${errors} experiment consistency issue(s) found.`);
  process.exit(1);
}

console.log(`Experiment consistency OK: ${path.relative(root, ventureDir)}`);
console.log(`Verified ${experiments.size} experiment(s).`);
