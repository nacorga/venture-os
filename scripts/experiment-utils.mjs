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

function nonEmptyStrings(values) {
  return Array.isArray(values) && values.length > 0 && values.every((value) => typeof value === 'string' && value.trim().length > 0);
}

export function experimentReadinessErrors(experiment) {
  const errors = [];

  if (!nonEmptyStrings(experiment.procedure)) {
    errors.push(`${experiment.id} procedure must contain at least one non-empty execution step before preregistration`);
  }

  for (const signal of ['success', 'failure', 'ambiguous']) {
    if (!nonEmptyStrings(experiment.signals?.[signal])) {
      errors.push(`${experiment.id} signals.${signal} must contain at least one observable criterion before preregistration`);
    }
  }

  for (const rule of ['on_success', 'on_failure', 'on_ambiguous']) {
    const value = experiment.decision_rules?.[rule];
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`${experiment.id} decision_rules.${rule} must be explicit before preregistration`);
    }
  }

  if (experiment.budget?.max_days === null || experiment.budget?.max_days === undefined || experiment.budget.max_days <= 0) {
    errors.push(`${experiment.id} budget.max_days must be an explicit positive time cap before preregistration`);
  }
  if (experiment.budget?.max_cash === null || experiment.budget?.max_cash === undefined || experiment.budget.max_cash < 0) {
    errors.push(`${experiment.id} budget.max_cash must be an explicit non-negative cost cap before preregistration`);
  }

  return errors;
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

  if (['running', 'completed'].includes(experiment.status) && !hasLockedAt) {
    errors.push(`${experiment.id} status ${experiment.status} requires a locked preregistration`);
    return errors;
  }

  if (hasLockedAt) {
    errors.push(...experimentReadinessErrors(experiment));
    const currentDesign = extractExperimentDesign(experiment);
    if (!isDeepStrictEqual(currentDesign, lockedDesign)) {
      errors.push(`${experiment.id} design differs from its preregistered snapshot`);
    }
  }

  if (experiment.status === 'completed' && !experiment.results?.completed_at) {
    errors.push(`${experiment.id} status completed requires results.completed_at`);
  }
  if (experiment.status === 'completed' && !(experiment.results?.observations?.length > 0)) {
    errors.push(`${experiment.id} status completed requires at least one recorded observation`);
  }
  if (experiment.status !== 'completed' && experiment.results?.completed_at) {
    errors.push(`${experiment.id} status ${experiment.status} cannot set results.completed_at`);
  }

  return errors;
}
