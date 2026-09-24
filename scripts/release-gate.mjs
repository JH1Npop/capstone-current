import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const fullE2E = process.argv.includes('--full-e2e');
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--full-e2e');

if (unknownArguments.length) {
  console.error(`Unknown release-gate argument(s): ${unknownArguments.join(', ')}`);
  process.exit(2);
}

const defaultPython = process.platform === 'win32'
  ? path.join(repoRoot, 'venv', 'Scripts', 'python.exe')
  : 'python';
const python = process.env.RELEASE_GATE_PYTHON || defaultPython;
const managePy = path.join(repoRoot, 'backend', 'manage.py');
const viteCli = path.join(repoRoot, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js');
const playwrightCli = path.join(repoRoot, 'node_modules', 'playwright', 'cli.js');

if (path.isAbsolute(python) && !fs.existsSync(python)) {
  console.error(`Release-gate Python was not found: ${python}`);
  process.exit(2);
}

function run(label, command, args, cwd = repoRoot) {
  console.log(`\n[release-gate] ${label}`);
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.error) {
    console.error(`[release-gate] ${label} could not start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[release-gate] ${label} failed with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
}

run('Django system check', python, [managePy, 'check']);
run('Python dependency integrity', python, ['-m', 'pip', 'check']);
run('Django migration drift check', python, [managePy, 'makemigrations', '--check', '--dry-run']);
run('Complete Django test suite', python, [managePy, 'test', '--noinput', '--verbosity', '1']);
run(
  'Frontend production build',
  process.execPath,
  [viteCli, 'build', '--configLoader', 'runner'],
  path.join(repoRoot, 'frontend'),
);

const e2eArguments = fullE2E
  ? [playwrightCli, 'test']
  : [
      playwrightCli,
      'test',
      'e2e/01-public-pages.spec.js',
      'e2e/02-authentication.spec.js',
    ];
run(fullE2E ? 'Complete browser suite' : 'Browser smoke suite', process.execPath, e2eArguments);

console.log(`\n[release-gate] PASS (${fullE2E ? 'full' : 'smoke'} browser coverage)`);
