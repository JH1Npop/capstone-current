// @ts-check
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';

const E2E_SETTINGS = 'afn_service_management.settings_e2e';
const START_TIMEOUT_MS = 120_000;
const STOP_TIMEOUT_MS = 10_000;

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer(child, url, label) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited before becoming ready (code ${child.exitCode}).`);
    }
    if (await probe(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not become ready at ${url} within ${START_TIMEOUT_MS}ms.`);
}

async function stopServer(child, label) {
  if (!child || child.exitCode !== null) return;

  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), STOP_TIMEOUT_MS)),
  ]);
  if (stopped) return;

  child.kill('SIGKILL');
  const forced = await Promise.race([
    once(child, 'exit').then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 2_000)),
  ]);
  if (!forced) throw new Error(`Unable to stop the managed ${label} process.`);
}

async function startWindowsServers(repoRoot) {
  const backendPort = Number(process.env.E2E_BACKEND_PORT || 8011);
  const frontendPort = Number(process.env.E2E_FRONTEND_PORT || 5181);
  const backendUrl = `http://127.0.0.1:${backendPort}`;
  const frontendUrl = `http://127.0.0.1:${frontendPort}`;

  if (await probe(`${backendUrl}/api/health/database/`)) {
    throw new Error(`E2E backend port ${backendPort} is already in use.`);
  }
  if (await probe(frontendUrl)) {
    throw new Error(`E2E frontend port ${frontendPort} is already in use.`);
  }

  const python = path.join(repoRoot, 'venv', 'Scripts', 'python.exe');
  const managePy = path.join(repoRoot, 'backend', 'manage.py');
  const backend = spawn(
    python,
    [managePy, 'runserver', `127.0.0.1:${backendPort}`, '--noreload', '--noasgi'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        DATABASE_URL: '',
        DATABASE_ENGINE: 'sqlite3',
        DJANGO_SETTINGS_MODULE: E2E_SETTINGS,
        DEBUG: 'True',
      },
      stdio: ['ignore', 'inherit', 'inherit'],
      windowsHide: true,
    },
  );

  let frontend;
  try {
    await waitForServer(backend, `${backendUrl}/api/health/database/`, 'E2E backend');
    const viteCli = path.join(repoRoot, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js');
    frontend = spawn(
      process.execPath,
      [viteCli, '--configLoader', 'runner', '--host', '127.0.0.1'],
      {
        cwd: path.join(repoRoot, 'frontend'),
        env: {
          ...process.env,
          VITE_BACKEND_HOST: backendUrl,
          VITE_DEV_SERVER_PORT: String(frontendPort),
        },
        stdio: ['ignore', 'inherit', 'inherit'],
        windowsHide: true,
      },
    );
    await waitForServer(frontend, frontendUrl, 'E2E frontend');
  } catch (error) {
    await stopServer(frontend, 'frontend');
    await stopServer(backend, 'backend');
    throw error;
  }

  return async () => {
    await stopServer(frontend, 'frontend');
    await stopServer(backend, 'backend');
  };
}

export default async function globalSetup() {
  const repoRoot = process.cwd();
  const python = process.platform === 'win32'
    ? path.join(repoRoot, 'venv', 'Scripts', 'python.exe')
    : 'python';
  const managePy = path.join(repoRoot, 'backend', 'manage.py');
  const env = { ...process.env, DJANGO_SETTINGS_MODULE: E2E_SETTINGS };

  execFileSync(python, [managePy, 'migrate', '--noinput'], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });
  execFileSync(python, [managePy, 'flush', '--noinput'], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });
  execFileSync(python, [path.join(repoRoot, 'e2e', 'seed-test-data-exec.py')], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });

  if (process.platform === 'win32') {
    return startWindowsServers(repoRoot);
  }
  return undefined;
}
