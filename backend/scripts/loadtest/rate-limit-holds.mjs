const BASE_URL = process.env.LOADTEST_URL || 'http://localhost:3000';
const BURST_SIZE = Number(process.env.LOADTEST_BURST ?? 50);

console.log(`Firing ${BURST_SIZE} concurrent anonymous /api/shorten requests from one IP...`);
console.log('Expectation: roughly SHORTEN_RATE_LIMIT_ANON (default 5) succeed, the rest get 429.\n');

const results = await Promise.all(
  Array.from({ length: BURST_SIZE }, (_, i) =>
    fetch(`${BASE_URL}/api/shorten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ longUrl: `https://example.com/burst-test/${i}` }),
    }).then((res) => res.status)
  )
);

const counts = results.reduce((acc, status) => {
  acc[status] = (acc[status] || 0) + 1;
  return acc;
}, {});

console.log('=== RATE LIMITER BURST TEST ===');
console.log(`Sent: ${BURST_SIZE} concurrent requests`);
console.log('Status breakdown:', counts);
console.log(`201 (created): ${counts[201] || 0}`);
console.log(`429 (rate limited): ${counts[429] || 0}`);
