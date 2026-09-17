import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { extractExperimentDesign, validateExperimentFile } from './experiment-utils.mjs';

const [target] = process.argv.slice(2);
if (!target) {
  console.error('Usage: npm run experiment:lock -- <experiment-dir|experiment.yaml>');
  process.exit(1);
}

let filePath = path.resolve(process.cwd(), target);
if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
  filePath = path.join(filePath, 'experiment.yaml');
}
if (!fs.existsSync(filePath)) {
  console.error(`experiment.yaml not found: ${target}`);
  process.exit(1);
}

const result = validateExperimentFile(filePath);
if (!result.valid) {
  for (const error of result.errors) console.error(`experiment.yaml ${error}`);
  process.exit(1);
}

const experiment = result.value;
if (experiment.status !== 'designed') {
  console.error(`Cannot lock ${experiment.id}: status must be designed, found ${experiment.status}`);
  process.exit(1);
}

const preregistration = experiment.preregistration ?? {};
if (preregistration.locked_at || preregistration.design) {
  console.error(`Cannot lock ${experiment.id}: preregistration is already set`);
  process.exit(1);
}

experiment.preregistration = {
  locked_at: new Date().toISOString(),
  design: extractExperimentDesign(experiment),
};

fs.writeFileSync(filePath, YAML.stringify(experiment));
console.log(`Locked experiment design: ${path.relative(process.cwd(), filePath)}`);
console.log(`Experiment ${experiment.id} can now move to status running without changing preregistered design fields.`);
