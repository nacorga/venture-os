import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseYamlFile, validateExperimentObject } from './venture-utils.mjs';

export function extractExperimentDesign(experiment) {
  return structuredClone({
    primary_assumption_id: experiment.primary_assumption_id,
    target: experiment.target,
    procedure: experiment.procedure,
    assets: experiment.assets,
    budget: experiment.budget,
    signals: experiment.signals,
    decision_rules: experiment.decision_rules,
  });
}

export function validateExperimentFile(filePath) {
  const parsed = parseYamlFile(filePath, 'experiment.yaml');
  if (!parsed.valid) return parsed;

  const schema = validateExperimentObject(parsed.value);
  return {
    valid: schema.valid,
    value: parsed.value,
    errors: schema.errors,
  };
}

export function listExperimentFiles(ventureDir) {
  const root = path.join(ventureDir, 'experiments');
  if (!fs.existsSync(root)) return [];

  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && entry.name === 'experiment.yaml') files.push(fullPath);
    }
  };
  visit(root);
  return files.sort();
}

export function experimentPreregistrationErrors(experiment) {
  const errors = [];
  const lockedAt = experiment.preregistration?.locked_at ?? null;
  const lockedDesign = experiment.preregistration?.design ?? null;
  const hasLockedAt = typeof lockedAt === 'string' && lockedAt.length > 0;
  const hasDesign = Boolean(lockedDesign && typeof lockedDesign === 'object' && !Array.isArray(lockedDesign));

  if (hasLockedAt !== hasDesign) {
    errors.push(`${experiment.id} preregistration must set locked_at and design together`);
    return errors;
  }

  if (experiment.status !== 'designed' && !hasLockedAt) {
    errors.push(`${experiment.id} status ${experiment.status} requires a locked preregistration`);
    return errors;
  }

  if (hasLockedAt) {
    const currentDesign = extractExperimentDesign(experiment);
    if (!isDeepStrictEqual(currentDesign, lockedDesign)) {
      errors.push(`${experiment.id} design differs from its preregistered snapshot`);
    }
  }

  if (experiment.status === 'completed' && !experiment.results?.completed_at) {
    errors.push(`${experiment.id} status completed requires results.completed_at`);
  }

  return errors;
}
