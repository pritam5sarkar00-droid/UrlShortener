import autocannon from 'autocannon';

const BASE_URL = process.env.LOADTEST_URL || 'http://localhost:3000';
const DURATION = Number(process.env.LOADTEST_DURATION ?? 15);
const CONNECTIONS = Number(process.env.LOADTEST_CONNECTIONS ?? 50);

console.log(`Running for ${DURATION}s with ${CONNECTIONS} connections...`);
console.log('NOTE: run this with SHORTEN_RATE_LIMIT_ANON set high (e.g. 1000000) - this measures raw');
console.log('      system capacity, not the production-configured per-IP limit (5/min anonymous).\n');

let counter = 0;

const result = await autocannon({
  url: `${BASE_URL}/api/shorten`,
  connections: CONNECTIONS,
  duration: DURATION,
  requests: [
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      setupRequest: (req) => ({
        ...req,
        body: JSON.stringify({ longUrl: `https://example.com/loadtest-create/${counter++}` }),
      }),
    },
  ],
});

console.log('\n=== CREATE PATH LOAD TEST ===');
console.log(`Requests/sec: ${result.requests.average.toFixed(1)}`);
console.log(`Latency (ms) - p50: ${result.latency.p50}, p95: ${result.latency.p97_5 ?? result.latency.p95}, p99: ${result.latency.p99}, max: ${result.latency.max}`);
console.log(`2xx: ${result['2xx']}, 4xx: ${result['4xx'] || 0}, 5xx: ${result['5xx'] || 0}, errors: ${result.errors}`);
console.log(`Total requests in window: ${result.requests.total}`);
