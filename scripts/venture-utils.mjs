import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import YAML from 'yaml';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDir, '..');
export const ventureSchemaPath = path.join(repoRoot, 'framework', 'schemas', 'venture.schema.json');
export const assumptionSchemaPath = path.join(repoRoot, 'framework', 'schemas', 'assumption.schema.json');
export const evidenceSchemaPath = path.join(repoRoot, 'framework', 'schemas', 'evidence.schema.json');
export const experimentSchemaPath = path.join(repoRoot, 'framework', 'schemas', 'experiment.schema.json');

let ventureValidator;
let experimentValidator;

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(loadJson(assumptionSchemaPath));
  ajv.addSchema(loadJson(evidenceSchemaPath));
  return ajv;
}

function formatValidationError(error) {
  const location = error.instancePath || '/';
  if (error.keyword === 'additionalProperties') {
    return `${location}: unexpected field '${error.params.additionalProperty}'`;
  }
  return `${location}: ${error.message}`;
}

export function parseYamlSource(source, label = 'YAML') {
  try {
    const document = YAML.parseDocument(source, {
      prettyErrors: true,
      uniqueKeys: true,
    });
    if (document.errors.length) {
      return {
        valid: false,
        value: null,
        errors: document.errors.map((error) => `invalid ${label}: ${error.message}`),
      };
    }
    const value = document.toJS({ maxAliasCount: 20 });
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { valid: false, value: null, errors: [`${label} must contain one YAML mapping/object`] };
    }
    return { valid: true, value, errors: [] };
  } catch (error) {
    return { valid: false, value: null, errors: [`invalid ${label}: ${error.message}`] };
  }
}

export function parseYamlFile(filePath, label = 'YAML') {
  try {
    return parseYamlSource(fs.readFileSync(filePath, 'utf8'), label);
  } catch (error) {
    return { valid: false, value: null, errors: [`cannot read file: ${error.message}`] };
  }
}

export function validateVentureObject(value) {
  if (!ventureValidator) {
    const ajv = createAjv();
    ventureValidator = ajv.compile(loadJson(ventureSchemaPath));
  }
  const valid = ventureValidator(value);
  return {
    valid: Boolean(valid),
    errors: valid ? [] : (ventureValidator.errors ?? []).map(formatValidationError),
  };
}

export function validateVentureFile(filePath) {
  const parsed = parseYamlFile(filePath, 'venture.yaml');
  if (!parsed.valid) return parsed;
  const schema = validateVentureObject(parsed.value);
  return {
    valid: schema.valid,
    value: parsed.value,
    errors: schema.errors,
  };
}

export function validateExperimentObject(value) {
  if (!experimentValidator) {
    const ajv = createAjv();
    experimentValidator = ajv.compile(loadJson(experimentSchemaPath));
  }
  const valid = experimentValidator(value);
  return {
    valid: Boolean(valid),
    errors: valid ? [] : (experimentValidator.errors ?? []).map(formatValidationError),
  };
}

export function parseDecisionProjection(source) {
  const match = source.match(
    /<!-- venture-state-projection:start -->([\s\S]*?)<!-- venture-state-projection:end -->/,
  );
  if (!match) {
    return { valid: false, value: null, errors: ['missing venture-state-projection block'] };
  }
  return parseYamlSource(match[1], 'decision projection');
}
