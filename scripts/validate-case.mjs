import fs from 'node:fs';
import path from 'node:path';
import {
  listCaseFiles,
  resolveCasePath,
  validateCaseFile,
} from './case-utils.mjs';

function printResult(filePath, result) {
  const label = path.relative(process.cwd(), filePath) || filePath;
  if (result.valid) {
    console.log(`OK: ${label}`);
    return;
  }

  console.error(`ERROR: ${label}`);
  for (const error of result.errors) console.error(`  - ${error}`);
}

const args = process.argv.slice(2);
if (args.length > 1) {
  console.error('Usage: npm run case:validate -- [<case-id|path-to-case.yaml>]');
  process.exit(1);
}

if (args.length === 1) {
  const filePath = resolveCasePath(args[0]);
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: case file not found: ${path.relative(process.cwd(), filePath)}`);
    process.exit(1);
  }

  const result = validateCaseFile(filePath);
  printResult(filePath, result);
  process.exit(result.valid ? 0 : 1);
}

const files = listCaseFiles();
if (!files.length) {
  console.log('No public cases found under cases/<id>/case.yaml');
  process.exit(0);
}

let failed = 0;
const seenIds = new Map();

for (const filePath of files) {
  const result = validateCaseFile(filePath);

  if (result.value?.id) {
    const existing = seenIds.get(result.value.id);
    if (existing) {
      result.valid = false;
      result.errors.push(
        `/id: duplicate case id '${result.value.id}' also used by ${path.relative(process.cwd(), existing)}`,
      );
    } else {
      seenIds.set(result.value.id, filePath);
    }
  }

  printResult(filePath, result);
  if (!result.valid) failed += 1;
}

if (failed) {
  console.error(`\n${failed} case(s) failed validation.`);
  process.exit(1);
}

console.log(`\n${files.length} case(s) valid.`);
