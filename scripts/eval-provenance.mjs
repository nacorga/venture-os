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

function digestFiles(root, files) {
  const hash = crypto.createHash('sha256');
  for (const relative of files) {
    hash.update(relative);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(root, relative)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function hashPathSet(root, relativePaths) {
  const files = [];
  for (const relativePath of relativePaths) collectFiles(root, relativePath, files);
  files.sort();
  return { sha256: digestFiles(root, files), files };
}

// What a frozen run's digest leaves out: the marker itself, and scoring output.
// Scores are written after freeze by independent judges, so they can never be
// part of what those judges are checking.
export function isExcludedFromRunDigest(relative) {
  return relative === 'FROZEN.json' || relative === 'SCORE.md' || relative.startsWith('scores/');
}

// A frozen run holds regular files and directories only. A symbolic link would
// be hashed as its target, which can change outside the run, so it is reported
// rather than followed; freeze refuses it and verify fails on it.
function collectRunFiles(runDir, relativePath, files, irregular) {
  for (const entry of fs.readdirSync(path.join(runDir, relativePath), { withFileTypes: true })) {
    const child = path.posix.join(relativePath, entry.name);
    if (entry.isDirectory()) collectRunFiles(runDir, child, files, irregular);
    else if (entry.isFile()) files.push(child);
    else irregular.push(child);
  }
}

export function runDigest(runDir) {
  const files = [];
  const irregular = [];
  collectRunFiles(runDir, '', files, irregular);
  const kept = files.filter((relative) => !isExcludedFromRunDigest(relative)).sort();
  return {
    sha256: digestFiles(runDir, kept),
    files: kept,
    irregular: irregular.filter((relative) => !isExcludedFromRunDigest(relative)).sort(),
  };
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
  '.claude/skills/eval-continue',
  'evals/schemas',
  'templates',
  'scripts/case-utils.mjs',
  'scripts/eval-suite.mjs',
  'scripts/new-venture.mjs',
  'scripts/new-eval-run.mjs',
  'scripts/check-evidence-consistency.mjs',
  'scripts/check-experiment-consistency.mjs',
  'scripts/check-venture-integrity.mjs',
  'scripts/venture-utils.mjs',
  'scripts/experiment-utils.mjs',
  'scripts/lock-experiment.mjs',
  'scripts/freeze-eval-run.mjs',
  'scripts/fork-eval-run.mjs',
  'scripts/reveal-utils.mjs',
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

// Evaluator-only inputs: hashed when a run is created, copied into
// <run>/evaluator/<file> only when it is frozen. One map, so freeze and verify
// cannot disagree about which inputs exist.
export const evaluatorBundle = {
  reference_sha256: { source: 'reference', file: 'reference.yaml' },
  rubric_sha256: { source: 'rubric', file: 'rubric.md' },
  score_skill_sha256: { source: 'score_skill', file: 'score-skill.md' },
  reveal_pair_sha256: { source: 'reveal_pair', file: 'reveal-pair.yaml' },
};

export const requiredEvaluatorSources = ['rubric_sha256', 'score_skill_sha256'];

// The reference and any reveal pair come from the suite (this repository's by
// default, or an external one passed with --suite); the rubric and scoring
// contract always come from the Venture OS checkout doing the evaluation.
export function evaluatorSourcePaths(root, caseName, referenceDir = path.join(root, 'evals', 'reference'), pairId = null) {
  return {
    reference: path.join(referenceDir, `${caseName}.yaml`),
    rubric: path.join(root, 'evals', 'RUBRIC.md'),
    score_skill: path.join(root, '.claude', 'skills', 'eval-score', 'SKILL.md'),
    reveal_pair: pairId ? path.join(referenceDir, 'reveal', caseName, `${pairId}.yaml`) : null,
  };
}

export function evaluatorSourceHashes(root, caseName, referenceDir, pairId = null) {
  const sources = evaluatorSourcePaths(root, caseName, referenceDir, pairId);
  const hashes = {};
  for (const [key, { source }] of Object.entries(evaluatorBundle)) {
    hashes[key] = sources[source] && fs.existsSync(sources[source]) ? sha256File(sources[source]) : null;
  }
  return hashes;
}

export function verifyFrozenRun(runDir) {
  const errors = [];
  const markerPath = path.join(runDir, 'FROZEN.json');
  if (!fs.existsSync(markerPath)) return { ok: false, errors: ['Run is not frozen.'], digest: null, marker: null };

  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch {
    return { ok: false, errors: ['Frozen marker is invalid JSON.'], digest: null, marker: null };
  }

  const { sha256: digest, files, irregular } = runDigest(runDir);
  for (const relative of irregular) errors.push(`Not a regular file: ${relative}`);
  const expectedFiles = Array.isArray(marker.files) ? [...marker.files].sort() : [];
  if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) errors.push('File set changed after freeze.');
  if (digest !== marker.sha256) errors.push(`Expected ${marker.sha256}, got ${digest}`);

  const evaluatorHashes = marker.evaluator_sources ?? {};
  for (const [key, { file }] of Object.entries(evaluatorBundle)) {
    const filePath = path.join(runDir, 'evaluator', file);
    const expected = evaluatorHashes[key] ?? null;
    if (expected === null) {
      if (fs.existsSync(filePath)) errors.push(`Frozen evaluator input exists but the marker records no hash: evaluator/${file}`);
      continue;
    }
    if (!fs.existsSync(filePath)) errors.push(`Frozen evaluator input missing: evaluator/${file}`);
    else if (sha256File(filePath) !== expected) errors.push(`Frozen evaluator input hash mismatch: evaluator/${file}`);
  }

  const evaluatorProvenancePath = path.join(runDir, 'evaluator', 'PROVENANCE.json');
  if (!fs.existsSync(evaluatorProvenancePath)) {
    errors.push('Frozen evaluator provenance is missing.');
  } else {
    try {
      const evaluatorProvenance = JSON.parse(fs.readFileSync(evaluatorProvenancePath, 'utf8'));
      if (evaluatorProvenance.framework_sha256 !== marker.framework_sha256) {
        errors.push('Frozen evaluator framework hash does not match FROZEN.json.');
      }
      for (const key of Object.keys(evaluatorBundle)) {
        if ((evaluatorProvenance.evaluator_sources?.[key] ?? null) !== (evaluatorHashes[key] ?? null)) {
          errors.push(`Frozen evaluator provenance disagrees on ${key}.`);
        }
      }
    } catch {
      errors.push('Frozen evaluator PROVENANCE.json is invalid JSON.');
    }
  }

  return { ok: errors.length === 0, errors, digest, marker };
}
