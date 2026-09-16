import fs from 'node:fs';
import path from 'node:path';
import {
  casesRoot,
  stringifyCase,
  validateCaseObject,
} from './case-utils.mjs';

function usage() {
  console.error(`Usage:\n  npm run case:new -- <id> <title> <statement> <category> [options]\n\nOptions:\n  --category <value>             Add another category (repeatable)\n  --tag <value>                  Add a tag (repeatable)\n  --provenance <type>            synthetic | anonymized-real | public-real\n  --source-url <url>             Required for public-real provenance\n  --audience <text>              Optional audience context\n  --geography <text>             Optional geography context\n  --business-model-notes <text>  Optional business model context\n  --constraint <text>            Add a constraint (repeatable)`);
}

function parseOptions(args) {
  const options = {
    categories: [],
    tags: [],
    provenance: 'synthetic',
    constraints: [],
  };

  const singleValueFlags = new Map([
    ['--provenance', 'provenance'],
    ['--source-url', 'sourceUrl'],
    ['--audience', 'audience'],
    ['--geography', 'geography'],
    ['--business-model-notes', 'businessModelNotes'],
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];

    if (!flag.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`Invalid option near '${flag}'`);
    }

    if (flag === '--category') options.categories.push(value);
    else if (flag === '--tag') options.tags.push(value);
    else if (flag === '--constraint') options.constraints.push(value);
    else if (singleValueFlags.has(flag)) options[singleValueFlags.get(flag)] = value;
    else throw new Error(`Unknown option '${flag}'`);

    index += 1;
  }

  return options;
}

const [id, title, statement, primaryCategory, ...rest] = process.argv.slice(2);

if (!id || !title || !statement || !primaryCategory) {
  usage();
  process.exit(1);
}

let options;
try {
  options = parseOptions(rest);
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  usage();
  process.exit(1);
}

const context = {};
if (options.audience) context.audience = options.audience;
if (options.geography) context.geography = options.geography;
if (options.businessModelNotes) context.business_model_notes = options.businessModelNotes;
if (options.constraints.length) context.constraints = options.constraints;

const provenance = { type: options.provenance };
if (options.sourceUrl) provenance.source_url = options.sourceUrl;

const caseData = {
  schema_version: 1,
  id,
  title,
  statement,
  categories: [...new Set([primaryCategory, ...options.categories])],
  tags: [...new Set(options.tags)],
  ...(Object.keys(context).length ? { context } : {}),
  provenance,
};

const validation = validateCaseObject(caseData);
if (!validation.valid) {
  console.error('ERROR: case input does not satisfy case schema v1:');
  for (const error of validation.errors) console.error(`  - ${error}`);
  process.exit(1);
}

const targetDir = path.join(casesRoot, id);
const targetFile = path.join(targetDir, 'case.yaml');

if (fs.existsSync(targetDir) || fs.existsSync(targetFile)) {
  console.error(`ERROR: case '${id}' already exists at ${path.relative(process.cwd(), targetDir)}`);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(targetFile, stringifyCase(caseData), 'utf8');

console.log(`Created ${path.relative(process.cwd(), targetFile)}`);
console.log(`Validate with: npm run case:validate -- ${id}`);
