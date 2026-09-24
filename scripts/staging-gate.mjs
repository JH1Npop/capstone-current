import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const python = process.env.RELEASE_GATE_PYTHON || (
  process.platform === 'win32'
    ? path.join(repoRoot, 'venv', 'Scripts', 'python.exe')
    : 'python'
);
const managePy = path.join(repoRoot, 'backend', 'manage.py');

if (process.env.STAGING_GATE_CONFIRM !== 'disposable-staging') {
  console.error('Set STAGING_GATE_CONFIRM=disposable-staging before running the staging gate.');
  process.exit(2);
}
if ((process.env.DEPLOYMENT_STAGE || '').toLowerCase() !== 'staging') {
  console.error('Set DEPLOYMENT_STAGE=staging before running the staging gate.');
  process.exit(2);
}
if ((process.env.DJANGO_ENV || '').toLowerCase() !== 'production') {
  console.error('Set DJANGO_ENV=production so staging uses the production safety contract.');
  process.exit(2);
}
if (!process.env.STAGING_TEST_DATABASE_URL || !process.env.STAGING_TEST_DATABASE_NAME) {
  console.error('STAGING_TEST_DATABASE_URL and STAGING_TEST_DATABASE_NAME are required.');
  process.exit(2);
}
if (!process.env.STAGING_BASE_URL || !process.env.STAGING_EXPECTED_HOST) {
  console.error('STAGING_BASE_URL and STAGING_EXPECTED_HOST are required.');
  process.exit(2);
}
if (!process.env.STAGING_TEST_DATABASE_NAME.toLowerCase().startsWith('test_')) {
  console.error('STAGING_TEST_DATABASE_NAME must start with test_.');
  process.exit(2);
}
if (path.isAbsolute(python) && !fs.existsSync(python)) {
  console.error(`Staging-gate Python was not found: ${python}`);
  process.exit(2);
}

function run(label, command, args, extraEnv = {}) {
  console.log(`\n[staging-gate] ${label}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    console.error(`[staging-gate] ${label} failed${result.error ? `: ${result.error.message}` : ` with exit code ${result.status}`}.`);
    process.exit(result.status ?? 1);
  }
}

run('Django production deployment check', python, [managePy, 'check', '--deploy']);
run('PostgreSQL, Redis, and durable-media dependency probes', python, [managePy, 'verify_staging_dependencies', '--confirm-staging']);
run(
  'PostgreSQL row-lock concurrency contracts',
  python,
  [managePy, 'test', 'services.test_postgres_concurrency', '--noinput', '--verbosity', '2'],
  {
    USE_STAGING_TEST_DATABASE: 'true',
    STAGING_TEST_CONFIRM_DISPOSABLE: 'disposable-staging',
  },
);
run('Deployed HTTPS and anonymous perimeter probes', process.execPath, [path.join(scriptDir, 'staging-perimeter-check.mjs')]);

console.log('\n[staging-gate] PASS: production-shaped staging dependencies, concurrency, and perimeter controls verified.');
