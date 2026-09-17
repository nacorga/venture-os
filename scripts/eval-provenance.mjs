import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function collectFiles(root, relativePath, output) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) return;
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    output.push(relativePath.replaceAll(path.sep, '/'));
    return;
  }
  if (!stat.isDirectory()) return;

  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) collectFiles(root, child, output);
    else if (entry.isFile()) output.push(child.replaceAll(path.sep, '/'));
  }
}

export function hashPathSet(root, relativePaths) {
  const files = [];
  for (const relativePath of relativePaths) collectFiles(root, relativePath, files);
  files.sort();

  const hash = crypto.createHash('sha256');
  for (const relative of files) {
    hash.update(relative);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(root, relative)));
    hash.update('\0');
  }

  return { sha256: hash.digest('hex'), files };
}

export const runtimePaths = [
  'CLAUDE.md',
  'framework',
  '.claude/agents',
  '.claude/skills/venture-new',
  '.claude/skills/venture-research',
  '.claude/skills/venture-challenge',
  '.claude/skills/venture-decide',
  '.claude/skills/venture-position',
  '.claude/skills/venture-experiment',
  '.claude/skills/venture-learn',
  '.claude/skills/venture-status',
  '.claude/skills/eval-new',
  '.claude/skills/eval-run',
  '.claude/skills/eval-freeze',
  'templates',
  'scripts/case-utils.mjs',
  'scripts/new-venture.mjs',
  'scripts/new-eval-run.mjs',
  'scripts/check-evidence-consistency.mjs',
  'scripts/check-experiment-consistency.mjs',
  'scripts/check-venture-integrity.mjs',
  'scripts/venture-utils.mjs',
  'scripts/experiment-utils.mjs',
  'scripts/lock-experiment.mjs',
  'scripts/freeze-eval-run.mjs',
  'scripts/verify-eval-run.mjs',
  'scripts/eval-provenance.mjs',
  'package.json',
  'package-lock.json',
];

export function runtimeProvenance(root) {
  const digest = hashPathSet(root, runtimePaths);
  return {
    framework_sha256: digest.sha256,
    framework_files: digest.files,
  };
}

export function gitProvenance(root) {
  let commit = 'unknown';
  let status = '';
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // Runs remain usable outside git; provenance explicitly records unavailable state.
  }

  return {
    commit,
    dirty: status.trim().length > 0,
    worktree_status_sha256: sha256Buffer(status),
  };
}

export function evaluatorSourcePaths(root, caseName) {
  return {
    reference: path.join(root, 'evals', 'reference', `${caseName}.yaml`),
    rubric: path.join(root, 'evals', 'README.md'),
    score_skill: path.join(root, '.claude', 'skills', 'eval-score', 'SKILL.md'),
  };
}

export function evaluatorSourceHashes(root, caseName) {
  const sources = evaluatorSourcePaths(root, caseName);
  return {
    reference_sha256: fs.existsSync(sources.reference) ? sha256File(sources.reference) : null,
    rubric_sha256: fs.existsSync(sources.rubric) ? sha256File(sources.rubric) : null,
    score_skill_sha256: fs.existsSync(sources.score_skill) ? sha256File(sources.score_skill) : null,
  };
}
