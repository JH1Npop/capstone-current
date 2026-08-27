// @ts-check
import { expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const TEST_PASSWORD = 'TestPass123!';
const TEST_PASSWORD_HASH =
  'pbkdf2_sha256$1$testsalt$xW4q2n4Ym9B5oGEb90oVsVxZpY1bBDrbNn+cZGvCAvs=';

const ensuredPasswordCache = new Map();
const authStateCache = new Map();

export async function clearStoredAuth(page) {
  await page.goto('http://localhost:5174/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem('afn_token');
    localStorage.removeItem('afn_user');
  });
}

export async function authenticateByApi(request, username, password = TEST_PASSWORD) {
  const response = await request.post('/api/users/login/', {
    data: { username, password },
    timeout: 60000,
  });

  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  return {
    token: data.token,
    user: data.user,
  };
}

export async function seedAuthState(page, authState) {
  await page.goto('http://localhost:5174/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate((state) => {
    localStorage.setItem('afn_token', state.token);
    localStorage.setItem('afn_user', JSON.stringify(state.user));
  }, authState);
}

export async function captureAuthStateViaUi(browser, username, expectedPath) {
  const page = await browser.newPage();
  await loginAs(page, username, { expectedPath });
  const authState = await page.evaluate(() => ({
    token: localStorage.getItem('afn_token'),
    user: JSON.parse(localStorage.getItem('afn_user') || 'null'),
  }));
  await page.close();
  return authState;
}

export function loadAuthStateFromBackend(username) {
  const cacheKey = `${username}:${TEST_PASSWORD}`;
  if (authStateCache.has(cacheKey)) {
    return authStateCache.get(cacheKey);
  }

  ensureUserPassword(username);

  const repoRoot = process.cwd();
  const pythonPath = path.join(repoRoot, 'venv', 'Scripts', 'python.exe');
  const managePyPath = path.join(repoRoot, 'backend', 'manage.py');
  const script = [
    'import json',
    'from django.core.serializers.json import DjangoJSONEncoder',
    'from django.test import RequestFactory',
    'from rest_framework.authtoken.models import Token',
    'from users.models import User',
    'from users.serializers import UserSerializer',
    `user = User.objects.get(username=${JSON.stringify(username)})`,
    'token, _ = Token.objects.get_or_create(user=user)',
    "request = RequestFactory().get('/api/users/me/')",
    'request.user = user',
    "payload = {'token': token.key, 'user': UserSerializer(user, context={'request': request}).data}",
    'print(json.dumps(payload, cls=DjangoJSONEncoder))',
  ].join('; ');

  const output = execFileSync(pythonPath, [managePyPath, 'shell', '-c', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 5,
  });

  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const authState = JSON.parse(lines[lines.length - 1]);
  authStateCache.set(cacheKey, authState);
  return authState;
}

export function ensureUserPassword(username, password = TEST_PASSWORD) {
  const cacheKey = `${username}:${password}`;
  if (ensuredPasswordCache.get(cacheKey)) {
    return;
  }

  const repoRoot = process.cwd();
  const pythonPath = path.join(repoRoot, 'venv', 'Scripts', 'python.exe');
  const sqlitePath = path.join(repoRoot, 'backend', 'db.sqlite3');
  const updateScript = [
    'import sqlite3, sys',
    'db_path, target_username, password_hash = sys.argv[1:4]',
    'connection = sqlite3.connect(db_path, timeout=30)',
    'cursor = connection.cursor()',
    'cursor.execute(',
    '  "UPDATE users_user SET password = ?, is_active = 1, email_verified = 1, status = ? WHERE username = ?",',
    '  (password_hash, "active", target_username),',
    ')',
    'connection.commit()',
    'print(cursor.rowcount)',
    'connection.close()',
  ].join('\n');

  if (password !== TEST_PASSWORD) {
    throw new Error('ensureUserPassword only supports the default test password.');
  }

  const result = execFileSync(pythonPath, ['-c', updateScript, sqlitePath, username, TEST_PASSWORD_HASH], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 5,
  });

  if (!/\b1\b/.test(result.trim())) {
    throw new Error(`Unable to prepare test credentials for ${username}.`);
  }

  ensuredPasswordCache.set(cacheKey, true);
}

export async function loginAs(page, username, { expectedPath = null, password = TEST_PASSWORD } = {}) {
  ensureUserPassword(username, password);
  await clearStoredAuth(page);
  await page.waitForLoadState('domcontentloaded');

  const usernameInput = page.locator('input[autocomplete="username"], input[placeholder*="username" i]');
  await usernameInput.first().fill(username);

  const passwordInput = page.locator('input[type="password"], input[autocomplete="current-password"]');
  await passwordInput.first().fill(password);

  const submitButton = page.getByRole('button', { name: /sign in|login|log in/i });
  await submitButton.click({ noWaitAfter: true });

  await page.waitForFunction(() => window.location.pathname !== '/login', null, { timeout: 120000 });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  if (expectedPath) {
    await expect(page).toHaveURL(expectedPath, { timeout: 120000 });
  }
}

export async function assertWorkspacePage(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await expect(page.locator('body')).toBeVisible();
  expect(page.url()).not.toContain('/login');
}

export async function visitWorkspacePage(page, path, screenshotPath) {
  await page.goto(path);
  await assertWorkspacePage(page);

  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
  });
}
