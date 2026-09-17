import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import {
  experimentDesignHash,
  resolveVentureStateForExperiment,
  validateExperimentFile,
} from './experiment-utils.mjs';

const [input] = process.argv.slice(2);
if (!input) {
  console.error('Usage: npm run experiment:lock -- <experiment.yaml>');
  process.exit(1);
}

const filePath = path.resolve(process.cwd(), input);
if (!fs.existsSync(filePath)) {
  console.error(`experiment.yaml not found: ${input}`);
  process.exit(1);
}

const venture = resolveVentureStateForExperiment(filePath);
if (!venture.valid) {
  for (const error of venture.errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

const result = validateExperimentFile(filePath, venture.value);
if (!result.valid) {
  for (const error of result.errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

const experiment = result.value;
if (experiment.status !== 'designed') {
  console.error(`Experiment must be in designed status before locking; current status: ${experiment.status}`);
  process.exit(1);
}

const missing = [];
if (!experiment.name?.trim()) missing.push('name');
if (!experiment.why_critical?.trim()) missing.push('why_critical');
if (!experiment.target?.description?.trim()) missing.push('target.description');
if (!(experiment.procedure?.length)) missing.push('procedure');
for (const key of ['success', 'failure', 'ambiguous']) {
  if (!(experiment.signals?.[key]?.length)) missing.push(`signals.${key}`);
}
for (const key of ['on_success', 'on_failure', 'on_ambiguous']) {
  if (!experiment.decision_rules?.[key]?.trim()) missing.push(`decision_rules.${key}`);
}
if (experiment.budget?.max_days == null && experiment.budget?.max_cash == null) {
  missing.push('budget.max_days or budget.max_cash');
}

if (missing.length) {
  console.error(`Cannot lock incomplete experiment design. Missing: ${missing.join(', ')}`);
  process.exit(1);
}

experiment.preregistration = {
  locked_at: new Date().toISOString(),
  sha256: experimentDesignHash(experiment),
};
experiment.status = 'running';

fs.writeFileSync(filePath, YAML.stringify(experiment, { lineWidth: 0 }));
console.log(`Locked experiment ${experiment.id}`);
console.log(`sha256: ${experiment.preregistration.sha256}`);
