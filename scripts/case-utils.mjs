import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import YAML from 'yaml';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDir, '..');
export const casesRoot = path.join(repoRoot, 'cases');
export const caseSchemaPath = path.join(repoRoot, 'framework', 'schemas', 'case.schema.json');

let compiledValidator;

function getValidator() {
  if (compiledValidator) return compiledValidator;

  const schema = JSON.parse(fs.readFileSync(caseSchemaPath, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  compiledValidator = ajv.compile(schema);
  return compiledValidator;
}

function formatValidationError(error) {
  const location = error.instancePath || '/';
  if (error.keyword === 'additionalProperties') {
    return `${location}: unexpected field '${error.params.additionalProperty}'`;
  }
  return `${location}: ${error.message}`;
}

export function validateCaseObject(value) {
  const validate = getValidator();
  const valid = validate(value);
  return {
    valid: Boolean(valid),
    errors: valid ? [] : (validate.errors ?? []).map(formatValidationError),
  };
}

export function parseCaseFile(filePath) {
  let source;
  try {
    source = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return { valid: false, value: null, errors: [`cannot read file: ${error.message}`] };
  }

  try {
    const document = YAML.parseDocument(source, {
      prettyErrors: true,
      uniqueKeys: true,
    });

    if (document.errors.length) {
      return {
        valid: false,
        value: null,
        errors: document.errors.map((error) => `invalid YAML: ${error.message}`),
      };
    }

    const value = document.toJS({ maxAliasCount: 20 });
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { valid: false, value: null, errors: ['case.yaml must contain one YAML mapping/object'] };
    }

    return { valid: true, value, errors: [] };
  } catch (error) {
    return { valid: false, value: null, errors: [`invalid YAML: ${error.message}`] };
  }
}

export function validateCaseFile(filePath) {
  const parsed = parseCaseFile(filePath);
  if (!parsed.valid) return parsed;

  const schemaResult = validateCaseObject(parsed.value);
  const errors = [...schemaResult.errors];

  const relative = path.relative(casesRoot, path.resolve(filePath));
  if (!relative.startsWith('..') && relative !== '') {
    const parts = relative.split(path.sep);
    if (parts.length !== 2 || parts[1] !== 'case.yaml') {
      errors.push('/: public cases must live at cases/<id>/case.yaml');
    } else if (parsed.value.id && parts[0] !== parsed.value.id) {
      errors.push(`/id: '${parsed.value.id}' must match directory name '${parts[0]}'`);
    }
  }

  return {
    valid: errors.length === 0,
    value: parsed.value,
    errors,
  };
}

export function resolveCasePath(input) {
  if (!input) return null;

  if (
    input.includes('/') ||
    input.includes('\\') ||
    input.endsWith('.yaml') ||
    input.endsWith('.yml')
  ) {
    return path.resolve(process.cwd(), input);
  }

  return path.join(casesRoot, input, 'case.yaml');
}

export function listCaseFiles() {
  if (!fs.existsSync(casesRoot)) return [];

  return fs
    .readdirSync(casesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(casesRoot, entry.name, 'case.yaml'))
    .sort();
}

export function stringifyCase(value) {
  return YAML.stringify(value, {
    lineWidth: 0,
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
  });
}
