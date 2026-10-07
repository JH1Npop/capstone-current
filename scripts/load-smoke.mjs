import { performance } from 'node:perf_hooks';

const baseUrl = String(process.env.LOAD_BASE_URL || '').replace(/\/$/, '');
const requests = Number.parseInt(process.env.LOAD_REQUESTS || '100', 10);
const concurrency = Number.parseInt(process.env.LOAD_CONCURRENCY || '10', 10);
const maxP95Ms = Number.parseInt(process.env.LOAD_MAX_P95_MS || '1500', 10);
const maxErrorRate = Number.parseFloat(process.env.LOAD_MAX_ERROR_RATE || '0.01');
const paths = ['/api/health/liveness/', '/api/health/readiness/'];

if (!baseUrl) throw new Error('Set LOAD_BASE_URL to the deployment under test.');
const target = new URL(baseUrl);
if (target.protocol !== 'https:' && process.env.LOAD_ALLOW_HTTP !== 'true') {
  throw new Error('LOAD_BASE_URL must use HTTPS. Set LOAD_ALLOW_HTTP=true only for a local target.');
}
if (!Number.isInteger(requests) || requests < 1 || requests > 10_000) {
  throw new Error('LOAD_REQUESTS must be between 1 and 10000.');
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) {
  throw new Error('LOAD_CONCURRENCY must be between 1 and 100.');
}

let nextIndex = 0;
const results = [];

async function worker() {
  while (nextIndex < requests) {
    const index = nextIndex;
    nextIndex += 1;
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${paths[index % paths.length]}`, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'afn-readiness-load-smoke/1.0' },
        signal: AbortSignal.timeout(10_000),
      });
      await response.arrayBuffer();
      results.push({ duration: performance.now() - started, ok: response.ok, status: response.status });
    } catch (error) {
      results.push({ duration: performance.now() - started, ok: false, status: 0, error: error.message });
    }
  }
}

const runStarted = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, () => worker()));
const elapsedMs = performance.now() - runStarted;
const durations = results.map((result) => result.duration).sort((left, right) => left - right);
const percentile = (fraction) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * fraction) - 1)];
const errors = results.filter((result) => !result.ok);
const errorRate = errors.length / results.length;
const summary = {
  target: target.origin,
  requests: results.length,
  concurrency,
  elapsed_ms: Math.round(elapsedMs),
  requests_per_second: Number((results.length / (elapsedMs / 1000)).toFixed(2)),
  latency_ms: {
    p50: Math.round(percentile(0.5)),
    p95: Math.round(percentile(0.95)),
    max: Math.round(durations.at(-1)),
  },
  errors: errors.length,
  error_rate: Number(errorRate.toFixed(4)),
  status_counts: Object.fromEntries(
    [...new Set(results.map((result) => result.status))].sort().map((status) => [
      status,
      results.filter((result) => result.status === status).length,
    ]),
  ),
};
console.log(JSON.stringify(summary, null, 2));

if (summary.latency_ms.p95 > maxP95Ms || errorRate > maxErrorRate) {
  console.error(`Load smoke failed thresholds: p95 <= ${maxP95Ms}ms, error rate <= ${maxErrorRate}.`);
  process.exitCode = 1;
}
