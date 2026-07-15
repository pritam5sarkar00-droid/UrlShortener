import autocannon from 'autocannon';
import { readFileSync } from 'node:fs';

const BASE_URL = process.env.LOADTEST_URL || 'http://localhost:3000';
const DURATION = Number(process.env.LOADTEST_DURATION ?? 15);
const CONNECTIONS = Number(process.env.LOADTEST_CONNECTIONS ?? 50);

const codes = JSON.parse(readFileSync('/tmp/loadtest-codes.json', 'utf-8'));
console.log(`Loaded ${codes.length} seeded codes. Running for ${DURATION}s with ${CONNECTIONS} connections...`);
console.log('NOTE: run this with REDIRECT_RATE_LIMIT set high (e.g. 1000000) - this measures raw');
console.log('      system capacity, not the production-configured per-IP limit. See rate-limit-holds.mjs');
console.log('      for proof that the real (low) limit actually holds under the same kind of burst.\n');

const result = await autocannon({
  url: BASE_URL,
  connections: CONNECTIONS,
  duration: DURATION,
  requests: [
    {
      method: 'GET',
      setupRequest: (req) => {
        const code = codes[Math.floor(Math.random() * codes.length)];
        return { ...req, path: `/${code}` };
      },
    },
  ],
});

console.log('\n=== REDIRECT PATH LOAD TEST ===');
console.log(`Requests/sec: ${result.requests.average.toFixed(1)}`);
console.log(`Latency (ms) - p50: ${result.latency.p50}, p95: ${result.latency.p97_5 ?? result.latency.p95}, p99: ${result.latency.p99}, max: ${result.latency.max}`);
console.log(`2xx/3xx: ${result['2xx'] + (result['3xx'] || 0)}, 4xx: ${result['4xx'] || 0}, 5xx: ${result['5xx'] || 0}, errors: ${result.errors}`);
console.log(`Total requests in window: ${result.requests.total}`);
