import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseYamlFile, validateExperimentObject, validateVentureFile } from './venture-utils.mjs';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function experimentDesignPayload(value) {
  return {
    version: value.version,
    id: value.id,
    name: value.name,
    primary_assumption_id: value.primary_assumption_id,
    why_critical: value.why_critical,
    target: value.target,
    procedure: value.procedure,
    assets: value.assets,
    budget: value.budget,
    signals: value.signals,
    decision_rules: value.decision_rules,
  };
}

export function experimentDesignHash(value) {
  const payload = JSON.stringify(canonicalize(experimentDesignPayload(value)));
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function validateExperimentFile(filePath, ventureState = null) {
  const parsed = parseYamlFile(filePath, 'experiment.yaml');
  if (!parsed.valid) return parsed;

  const schema = validateExperimentObject(parsed.value);
  const errors = [...schema.errors];
  const value = parsed.value;

  if (ventureState) {
    const assumptionIds = new Set((ventureState.assumptions ?? []).map((item) => item.id));
    const evidenceIds = new Set((ventureState.evidence_index ?? []).map((item) => item.id));
    if (!assumptionIds.has(value.primary_assumption_id)) {
      errors.push(`/primary_assumption_id: references missing assumption ${value.primary_assumption_id}`);
    }
    for (const id of value.results?.evidence_ids ?? []) {
      if (!evidenceIds.has(id)) errors.push(`/results/evidence_ids: references missing evidence ${id}`);
    }
  }

  if (['running', 'completed', 'cancelled'].includes(value.status)) {
    if (!value.preregistration?.locked_at || !value.preregistration?.sha256) {
      errors.push('/preregistration: running/completed/cancelled experiments must be locked');
    } else {
      const expected = experimentDesignHash(value);
      if (expected !== value.preregistration.sha256) {
        errors.push('/preregistration/sha256: experiment design changed after preregistration lock');
      }
    }
  }

  return { valid: errors.length === 0, value, errors };
}

export function resolveVentureStateForExperiment(filePath) {
  const experimentDir = path.dirname(path.resolve(filePath));
  const ventureDir = path.dirname(path.dirname(experimentDir));
  const venturePath = path.join(ventureDir, 'venture.yaml');
  if (!fs.existsSync(venturePath)) {
    return { valid: false, value: null, errors: [`venture.yaml not found for experiment: ${venturePath}`] };
  }
  return validateVentureFile(venturePath);
}
