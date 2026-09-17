import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [target] = process.argv.slice(2);
if (!target) {
  console.error('Usage: npm run evidence:check -- <venture-dir|venture.yaml>');
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
for (const script of ['check-evidence-consistency.mjs', 'check-experiment-integrity.mjs']) {
  const result = spawnSync(process.execPath, [path.join(scriptDir, script), target], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
