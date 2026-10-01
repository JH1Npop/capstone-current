import https from 'node:https';

const baseUrlValue = process.env.STAGING_BASE_URL || '';
const confirmation = process.env.STAGING_GATE_CONFIRM || '';
const expectedHost = (process.env.STAGING_EXPECTED_HOST || '').toLowerCase();
const requestTimeoutMs = Number.parseInt(process.env.STAGING_HTTP_TIMEOUT_MS || '70000', 10);

if (confirmation !== 'disposable-staging') {
  console.error('Set STAGING_GATE_CONFIRM=disposable-staging before probing a staging deployment.');
  process.exit(2);
}
if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1000) {
  console.error('STAGING_HTTP_TIMEOUT_MS must be an integer of at least 1000 milliseconds.');
  process.exit(2);
}

let baseUrl;
try {
  baseUrl = new URL(baseUrlValue);
} catch {
  console.error('STAGING_BASE_URL must be a valid HTTPS URL.');
  process.exit(2);
}

if (baseUrl.protocol !== 'https:') {
  console.error('STAGING_BASE_URL must use HTTPS.');
  process.exit(2);
}
if (!expectedHost || baseUrl.host.toLowerCase() !== expectedHost) {
  console.error('STAGING_EXPECTED_HOST must exactly match the STAGING_BASE_URL host.');
  process.exit(2);
}
if (process.env.PRODUCTION_BASE_URL) {
  const productionUrl = new URL(process.env.PRODUCTION_BASE_URL);
  if (productionUrl.origin === baseUrl.origin) {
    console.error('STAGING_BASE_URL must not match PRODUCTION_BASE_URL.');
    process.exit(2);
  }
}

const failures = [];

async function request(pathname, options = {}) {
  const response = await fetch(new URL(pathname, baseUrl), {
    redirect: 'manual',
    signal: AbortSignal.timeout(requestTimeoutMs),
    ...options,
  });
  return response;
}

function requestStatusWithNativeHttps(pathname, method) {
  const target = new URL(pathname, baseUrl);

  return new Promise((resolve, reject) => {
    const request = https.request(target, { method }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode || 0));
    });

    request.setTimeout(requestTimeoutMs, () => {
      request.destroy(new Error(`${method} request timed out`));
    });
    request.on('error', reject);
    request.end();
  });
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

try {
  const liveness = await request('/api/health/liveness/');
  expect(liveness.status === 200, `liveness returned HTTP ${liveness.status}`);

  const readiness = await request('/api/health/readiness/');
  const readinessBody = await readiness.json().catch(() => ({}));
  expect(readiness.status === 200, `readiness returned HTTP ${readiness.status}`);
  expect(readinessBody.status === 'ready', 'readiness body did not report ready');
  for (const dependency of ['database', 'cache', 'realtime', 'storage']) {
    expect(readinessBody.checks?.[dependency] === 'ready', `${dependency} readiness was not ready`);
  }

  const publicResponse = await request('/api/public/landing-page/', {
    headers: { Origin: 'https://unauthorized-origin.invalid' },
  });
  expect(publicResponse.status === 200, `public landing settings returned HTTP ${publicResponse.status}`);
  expect(!publicResponse.headers.get('access-control-allow-origin'), 'unauthorized CORS origin was reflected');
  expect(publicResponse.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff', 'X-Content-Type-Options is missing or unsafe');
  expect(publicResponse.headers.get('x-frame-options')?.toUpperCase() === 'DENY', 'X-Frame-Options is not DENY');
  expect(Boolean(publicResponse.headers.get('strict-transport-security')), 'Strict-Transport-Security is missing');

  for (const protectedPath of [
    '/api/dashboard/stats/',
    '/api/admin/settings/',
    '/api/inventory/items/',
  ]) {
    const protectedResponse = await request(protectedPath);
    expect([401, 403].includes(protectedResponse.status), `${protectedPath} allowed anonymous access (${protectedResponse.status})`);
  }

  // WHATWG fetch intentionally rejects TRACE before it reaches the server. Use
  // Node's native HTTPS client so this probe verifies the deployed perimeter.
  const traceStatus = await requestStatusWithNativeHttps('/api/health/liveness/', 'TRACE');
  expect([405, 501].includes(traceStatus), `TRACE was not rejected (${traceStatus})`);
} catch (error) {
  failures.push(`perimeter probe failed (${error.name || 'Error'}: ${error.message})`);
}

if (failures.length) {
  console.error('[staging-perimeter] FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[staging-perimeter] PASS: HTTPS, dependency readiness, security headers, CORS, anonymous access, and TRACE controls verified.');
