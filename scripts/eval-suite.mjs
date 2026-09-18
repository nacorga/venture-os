import fs from 'node:fs';
import path from 'node:path';
import { casesRoot, validateCaseFile } from './case-utils.mjs';

// A suite is where a benchmark's cases and evaluator references live: this
// repository by default, or a directory passed with --suite, so a private
// holdout never has to be committed here. It mirrors this layout:
// <suite>/cases/<id>/case.yaml and <suite>/evals/reference/<id>.yaml.
//
// Only the suite's directory name is recorded in run metadata. The agent under
// test reads metadata.json, and an absolute path would tell it where the
// evaluator references are.
export function resolveSuite(root, suitePath) {
  if (!suitePath) {
    return { label: null, casesRoot, referenceDir: path.join(root, 'evals', 'reference') };
  }

  const suiteRoot = path.resolve(process.cwd(), suitePath);
  const suiteCases = path.join(suiteRoot, 'cases');
  if (!fs.existsSync(suiteCases) || !fs.statSync(suiteCases).isDirectory()) {
    throw new Error(`Suite has no cases/ directory: ${suitePath}`);
  }
  return {
    label: path.basename(suiteRoot),
    casesRoot: suiteCases,
    referenceDir: path.join(suiteRoot, 'evals', 'reference'),
  };
}

export function validateSuiteCase(suite, caseName) {
  const casePath = path.join(suite.casesRoot, caseName, 'case.yaml');
  if (!fs.existsSync(casePath)) {
    return { casePath, valid: false, value: null, errors: [`Unknown case: ${caseName}`] };
  }

  const result = validateCaseFile(casePath);
  const errors = [...result.errors];
  // validateCaseFile checks id against the directory only inside this
  // repository's cases/; a suite case gets the same rule here.
  if (suite.label !== null && result.value?.id && result.value.id !== caseName) {
    errors.push(`/id: '${result.value.id}' must match directory name '${caseName}'`);
  }
  return { casePath, valid: errors.length === 0, value: result.value, errors };
}
