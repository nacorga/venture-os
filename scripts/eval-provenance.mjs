import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function walk(root, target, files) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    files.push(target);
    return;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) walk(root, full, files);
    else files.push(full);
  }
}

export function hashPaths(root, relativePaths) {
  const files = [];
  for (const relative of relativePaths) walk(root, path.join(root, relative), files);
  files.sort((a, b) => path.relative(root, a).localeCompare(path.relative(root, b)));

  const hash = crypto.createHash('sha256');
  for (const filePath of files) {
    const relative = path.relative(root, filePath).replaceAll(path.sep, '/');
    hash.update(relative);
    hash.update('\0');
    hash.update(fs.readFileSync(filePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function frameworkHash(root) {
  return hashPaths(root, [
    '.claude',
    'framework',
    'templates',
    'scripts',
    'package.json',
    'package-lock.json',
  ]);
}

export function gitState(root) {
  let commit = 'unknown';
  let dirty = null;
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    dirty = execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().length > 0;
  } catch {
    // Runs remain usable outside git; provenance records the limitation.
  }
  return { commit, working_tree_dirty: dirty };
}

export function evaluatorContext(root, caseName) {
  const rubricPath = path.join(root, 'evals', 'README.md');
  const referencePath = path.join(root, 'evals', 'reference', `${caseName}.yaml`);
  return {
    rubric_sha256: sha256File(rubricPath),
    reference_sha256: sha256File(referencePath),
  };
}
