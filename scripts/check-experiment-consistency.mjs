import fs from 'node:fs';
import path from 'node:path';
import { listExperimentFiles, experimentPreregistrationErrors, validateExperimentFile } from './experiment-utils.mjs';
import { parseDecisionProjection, validateVentureFile } from './venture-utils.mjs';

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

function validateLinkedExperimentAction(action, label, requireExecutableStatus) {
  if (!action || typeof action !== 'object' || Array.isArray(action) || !action.experiment_id) return;

  if (!/^X[0-9]{3,}$/.test(action.experiment_id)) {
    fail(`${label}.experiment_id ${action.experiment_id} is not a stable X### ID`);
  } else if (!experiments.has(action.experiment_id)) {
    fail(`${label} references missing experiment ${action.experiment_id}`);
  } else {
    const experiment = experiments.get(action.experiment_id);
    if (action.type !== 'experiment') {
      fail(`${label} references ${action.experiment_id} but type is ${action.type}, not experiment`);
    }
    if (action.assumption_id !== experiment.primary_assumption_id) {
      fail(`${label} assumption ${action.assumption_id ?? 'null'} does not match ${action.experiment_id} primary assumption ${experiment.primary_assumption_id}`);
    }
    if (action.success_signal !== null || action.failure_signal !== null) {
      fail(`${label} linked to ${action.experiment_id} must keep success_signal/failure_signal null; preregistered criteria live in experiment.yaml`);
    }
    if (!experiment.preregistration?.locked_at || !experiment.preregistration?.design) {
      fail(`${label} cannot reference ${action.experiment_id} before its design is preregistered`);
    }
    if (requireExecutableStatus && !['designed', 'running'].includes(experiment.status)) {
      fail(`${label} cannot execute ${action.experiment_id} with status ${experiment.status}`);
    }
  }
}

const nextAction = venture.next_action;
if (
  venture.stage === 'experiment'
  && nextAction?.type === 'experiment'
  && !nextAction.experiment_id
) {
  fail('experiment-stage next_action must reference the concrete preregistered experiment with experiment_id');
}
validateLinkedExperimentAction(nextAction, 'next_action', true);

const decisionsDir = path.join(ventureDir, 'decisions');
if (fs.existsSync(decisionsDir)) {
  for (const entry of fs.readdirSync(decisionsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const filePath = path.join(decisionsDir, entry.name);
    const projection = parseDecisionProjection(fs.readFileSync(filePath, 'utf8'));
    if (!projection.valid) continue; // The evidence checker reports projection defects.
    validateLinkedExperimentAction(
      projection.value.snapshot?.next_action,
      `${path.relative(root, filePath)} snapshot next_action`,
      false,
    );
  }
}

if (errors) {
  console.error(`\n${errors} experiment consistency issue(s) found.`);
  process.exit(1);
}

console.log(`Experiment consistency OK: ${path.relative(root, ventureDir)}`);
console.log(`Verified ${experiments.size} experiment(s).`);
