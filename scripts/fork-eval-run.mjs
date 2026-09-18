import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import YAML from 'yaml';
import { resolveSuite } from './eval-suite.mjs';
import {
  evaluatorSourceHashes,
  gitProvenance,
  runtimeProvenance,
  sha256File,
  verifyFrozenRun,
} from './eval-provenance.mjs';
import { findLockedExperimentsFor, structuredRoutingErrors } from './experiment-utils.mjs';
import {
  forkKeyPath,
  looksForked,
  parseArm,
  plantedPacket,
  preregPacket,
  readForkKey,
  revealPairPath,
  validateRevealPairFile,
} from './reveal-utils.mjs';
import { validateVentureFile } from './venture-utils.mjs';

// A fork starts a second phase from a frozen run: the same venture state, then
// one packet of evidence the first phase never saw. Every fork of a parent
// starts from the parent's phase-1 state byte for byte, and freeze checks the
// fork against the parent again, so what differs between forks is the packet.
//
// The fork's ID is opaque and its arm is recorded only in a sealed key under
// evals/runs/.keys/: the run under test must work out what its evidence says
// without being told which branch it is in.

function stop(message) {
  console.error(message);
  process.exit(1);
}

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      arm: { type: 'string' },
      rep: { type: 'string', default: '1' },
      suite: { type: 'string' },
      'model-label': { type: 'string' },
      'cross-framework': { type: 'boolean', default: false },
    },
  });
} catch (error) {
  stop(error.message);
}

const [parentId] = args.positionals;
const usage = 'Usage: npm run eval:fork -- <parent-run-id> --arm <prereg-failure|prereg-success|P###-a|P###-b> [--rep <n>] [--suite <path>] [--model-label <label>] [--cross-framework]';
if (!parentId || parentId.includes('/') || parentId.includes('..')) stop(usage);
const arm = parseArm(args.values.arm);
if (!arm) stop(usage);
if (!/^[1-9][0-9]*$/.test(args.values.rep)) stop('--rep must be a positive integer');
const modelLabel = args.values['model-label'];
if (modelLabel !== undefined && !/^[a-zA-Z0-9._-]+$/.test(modelLabel)) {
  stop('Model label may contain only letters, numbers, dots, underscores and hyphens.');
}

const root = process.cwd();
const runsDir = path.join(root, 'evals', 'runs');
const parentDir = path.join(runsDir, parentId);
if (!fs.existsSync(parentDir)) stop(`Parent run not found: ${parentId}`);

const verified = verifyFrozenRun(parentDir);
if (!verified.ok) stop(`Cannot fork ${parentId}: it is not a verified frozen run.\n${verified.errors.join('\n')}`);
const marker = verified.marker;

const parentMetadata = JSON.parse(fs.readFileSync(path.join(parentDir, 'metadata.json'), 'utf8'));
if (readForkKey(runsDir, parentId) || looksForked(parentDir)) stop(`Cannot fork ${parentId}: it is itself a fork. Fork its parent instead.`);

const runtime = runtimeProvenance(root);
const crossFramework = runtime.framework_sha256 !== marker.framework_sha256;
if (crossFramework && !args.values['cross-framework']) {
  stop(`Cannot fork ${parentId}: the effective Venture OS runtime differs from the one it was frozen with. Pass --cross-framework to run its second phase on this framework deliberately.`);
}

const suiteLabel = parentMetadata.suite?.label ?? null;
if (suiteLabel && !args.values.suite) {
  stop(`Cannot fork ${parentId}: it was created from suite ${suiteLabel}; pass --suite <path to that suite>.`);
}
let suite;
try {
  suite = resolveSuite(root, args.values.suite);
} catch (error) {
  stop(`Cannot fork ${parentId}: ${error.message}`);
}
if (suite.label !== suiteLabel) {
  stop(`Cannot fork ${parentId}: it was created from ${suiteLabel ?? 'this repository'}, but --suite points at ${suite.label}.`);
}

const parentVenture = validateVentureFile(path.join(parentDir, 'venture', 'venture.yaml'));
if (!parentVenture.valid) stop(`Cannot fork ${parentId}: its venture.yaml is not schema-valid.`);
const decision = parentVenture.value.latest_decision;

let packet;
let revealSource;
if (arm.kind === 'prereg') {
  const action = decision.snapshot.next_action;
  if (action?.type !== 'experiment') {
    stop(`Cannot fork ${parentId} with a preregistration arm: ${decision.id} did not decide an experiment.`);
  }
  const currentExperimentId = parentVenture.value.next_action?.experiment_id;
  const candidates = findLockedExperimentsFor(path.join(parentDir, 'venture'), action.assumption_id)
    .filter(({ experiment }) => structuredRoutingErrors({ id: experiment.id, ...experiment.preregistration.design }).length === 0)
    .sort((left, right) => Number(right.experiment.id === currentExperimentId) - Number(left.experiment.id === currentExperimentId));
  if (!candidates.length) {
    stop(`Cannot fork ${parentId} with a preregistration arm: no locked experiment on ${action.assumption_id} routes its success and failure results to gate outcomes.`);
  }
  const { experiment, filePath } = candidates[0];
  packet = preregPacket(experiment, arm.branch);
  revealSource = {
    branch: arm.branch,
    experiment_id: experiment.id,
    experiment_path: path.relative(parentDir, filePath).replaceAll(path.sep, '/'),
  };
} else {
  const pairFile = revealPairPath(suite.referenceDir, parentMetadata.case, arm.pairId);
  if (!fs.existsSync(pairFile)) stop(`Cannot fork ${parentId}: no reveal pair ${arm.pairId} for case ${parentMetadata.case}.`);
  const pair = validateRevealPairFile(pairFile, parentMetadata.case);
  if (!pair.valid) stop(`Cannot fork ${parentId}: reveal pair ${arm.pairId} is invalid.\n${pair.errors.join('\n')}`);
  if (!pair.value.arms[arm.side]) stop(`Cannot fork ${parentId}: reveal pair ${arm.pairId} has no arm ${arm.side}.`);
  packet = plantedPacket(pair.value, arm.side);
  revealSource = { pair_id: arm.pairId, side: arm.side, pair_sha256: sha256File(pairFile) };
}

const childId = `${parentId}--${crypto.randomBytes(4).toString('hex')}`;
const childDir = path.join(runsDir, childId);
if (fs.existsSync(childDir)) stop(`Fork ID collision: ${childId}. Run the command again.`);

fs.mkdirSync(childDir, { recursive: true });
fs.copyFileSync(path.join(parentDir, 'case.yaml'), path.join(childDir, 'case.yaml'));
fs.cpSync(path.join(parentDir, 'venture'), path.join(childDir, 'venture'), { recursive: true });
fs.copyFileSync(path.join(parentDir, 'RESULT.md'), path.join(childDir, 'RESULT.phase1.md'));
fs.mkdirSync(path.join(childDir, 'reveal'));
const packetPath = path.join(childDir, 'reveal', 'packet.yaml');
fs.writeFileSync(packetPath, YAML.stringify(packet, { lineWidth: 0 }));

const git = gitProvenance(root);
const evaluatorSources = evaluatorSourceHashes(root, parentMetadata.case, suite.referenceDir, arm.kind === 'planted' ? arm.pairId : null);
// The run reads this file, so it says nothing about the reveal: not the arm,
// not the parent's outcome, not whether it is one arm of a pair.
const metadata = {
  run_id: childId,
  case: parentMetadata.case,
  case_schema_version: parentMetadata.case_schema_version,
  model_label: modelLabel ?? parentMetadata.model_label,
  ...(suiteLabel ? { suite: { label: suiteLabel } } : {}),
  created_at: new Date().toISOString(),
  commit: git.commit,
  status: 'CREATED',
  provenance: {
    git,
    case_sha256: sha256File(path.join(childDir, 'case.yaml')),
    ...runtime,
    evaluator_sources: evaluatorSources,
  },
};
fs.writeFileSync(path.join(childDir, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');

const key = {
  fork_id: childId,
  case: parentMetadata.case,
  created_at: metadata.created_at,
  parent: {
    run_id: parentId,
    frozen_sha256: marker.sha256,
    framework_sha256: marker.framework_sha256,
    decision_id: decision.id,
    outcome: decision.outcome,
  },
  reveal: {
    kind: arm.kind,
    arm: args.values.arm,
    ...revealSource,
    rep: Number(args.values.rep),
    packet_sha256: sha256File(packetPath),
    cross_framework: crossFramework,
  },
};
fs.mkdirSync(path.dirname(forkKeyPath(runsDir, childId)), { recursive: true });
fs.writeFileSync(forkKeyPath(runsDir, childId), JSON.stringify(key, null, 2) + '\n');

const suiteNote = suiteLabel ? ' --suite <path to the suite this run was created from>' : '';
fs.writeFileSync(path.join(childDir, 'RUN.md'), `# Eval Run: ${parentMetadata.case} — second phase\n\nThis run continues from a frozen first phase. The evidence revealed to it is in \`reveal/packet.yaml\`.\n\n## Canonical workflow\n\nOperational instructions live in Claude Code skills. This file intentionally does not duplicate them.\n\n1. Start a fresh Claude Code session and run:\n\n   \`/eval-continue ${childId}\`\n\n2. When that skill completes, run:\n\n   \`/eval-freeze ${childId}${suiteNote}\`\n\n3. Then, outside any judged session:\n\n   \`npm run eval:verdict -- ${childId}\`\n\nIf any procedure differs between this file and a skill, the skill is authoritative.\n`);

console.log(`Created evals/runs/${childId}`);
console.log(`Forked from ${parentId} after ${decision.id} (${decision.outcome}); arm ${args.values.arm}.`);
if (crossFramework) console.log('Note: second phase runs on a different framework than the first (--cross-framework).');
console.log(`Fresh Claude Code session: /eval-continue ${childId}`);
