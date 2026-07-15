import { createShortUrl } from '../../src/services/url.service.js';
import { connectRedis, ensureShortcodeShield } from '../../src/config/redis.js';
import { checkDbConnection } from '../../src/config/db.js';
import { writeFileSync } from 'node:fs';

const COUNT = Number(process.argv[2] ?? 500);

async function main() {
  await checkDbConnection();
  try {
    await connectRedis();
    await ensureShortcodeShield();
  } catch {
    // fine for seeding - load test scripts don't depend on cache state
  }

  console.log(`Seeding ${COUNT} links through the real create path...`);
  const codes = [];
  for (let i = 0; i < COUNT; i++) {
    const row = await createShortUrl({ longUrl: `https://example.com/loadtest/${i}` });
    codes.push(row.short_code);
  }

  writeFileSync('/tmp/loadtest-codes.json', JSON.stringify(codes));
  console.log(`Seeded ${codes.length} codes -> /tmp/loadtest-codes.json`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
