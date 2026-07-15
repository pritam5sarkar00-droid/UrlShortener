import { test } from 'node:test';
import assert from 'node:assert/strict';

const SRC = '../../src';

test('shortcode shield saying "definitely absent" skips Postgres entirely', async (t) => {
  let queryCallCount = 0;

  t.mock.module(`${SRC}/config/redis.js`, {
    namedExports: {
      redisClient: {},
      connectRedis: async () => {},
      ensureShortcodeShield: async () => {},
      addToShortcodeShield: async () => {},
      removeFromShortcodeShield: async () => {},
      existsInShortcodeShield: async () => false,
    },
  });
  t.mock.module(`${SRC}/config/db.js`, {
    namedExports: {
      pool: { query: async () => { queryCallCount++; return { rows: [] }; } },
      checkDbConnection: async () => {},
    },
  });
  t.mock.module(`${SRC}/services/cache.service.js`, {
    namedExports: {
      getCachedUrl: async () => null,
      setCachedUrl: async () => {},
      deleteCachedUrl: async () => {},
    },
  });

  const { getUrlByCode } = await import(`${SRC}/services/url.service.js?v=${Date.now()}a`);
  const result = await getUrlByCode('nonexistentCode123');

  assert.equal(result, null);
  assert.equal(queryCallCount, 0, 'Postgres must never be queried when the shield guarantees absence');
});

test('shortcode shield saying "maybe exists" falls through to Postgres', async (t) => {
  let queryCallCount = 0;

  t.mock.module(`${SRC}/config/redis.js`, {
    namedExports: {
      redisClient: {},
      connectRedis: async () => {},
      ensureShortcodeShield: async () => {},
      addToShortcodeShield: async () => {},
      removeFromShortcodeShield: async () => {},
      existsInShortcodeShield: async () => true,
    },
  });
  t.mock.module(`${SRC}/config/db.js`, {
    namedExports: {
      pool: {
        query: async () => {
          queryCallCount++;
          return {
            rows: [{ short_code: 'abc123', long_url: 'https://example.com', is_active: true, expires_at: null }],
          };
        },
      },
      checkDbConnection: async () => {},
    },
  });
  t.mock.module(`${SRC}/services/cache.service.js`, {
    namedExports: {
      getCachedUrl: async () => null,
      setCachedUrl: async () => {},
      deleteCachedUrl: async () => {},
    },
  });

  const { getUrlByCode } = await import(`${SRC}/services/url.service.js?v=${Date.now()}b`);
  const result = await getUrlByCode('abc123');

  assert.equal(queryCallCount, 1, 'Postgres should be queried when the shield says maybe-exists');
  assert.equal(result.long_url, 'https://example.com');
});

test('a cached, non-expired entry never touches Postgres or the shortcode shield', async (t) => {
  let queryCallCount = 0;
  let shieldCallCount = 0;

  t.mock.module(`${SRC}/config/redis.js`, {
    namedExports: {
      redisClient: {},
      connectRedis: async () => {},
      ensureShortcodeShield: async () => {},
      addToShortcodeShield: async () => {},
      removeFromShortcodeShield: async () => {},
      existsInShortcodeShield: async () => { shieldCallCount++; return true; },
    },
  });
  t.mock.module(`${SRC}/config/db.js`, {
    namedExports: {
      pool: { query: async () => { queryCallCount++; return { rows: [] }; } },
      checkDbConnection: async () => {},
    },
  });
  t.mock.module(`${SRC}/services/cache.service.js`, {
    namedExports: {
      getCachedUrl: async () => ({ longUrl: 'https://cached.example.com', expiresAt: null }),
      setCachedUrl: async () => {},
      deleteCachedUrl: async () => {},
    },
  });

  const { getUrlByCode } = await import(`${SRC}/services/url.service.js?v=${Date.now()}c`);
  const result = await getUrlByCode('cachedCode');

  assert.equal(result.long_url, 'https://cached.example.com');
  assert.equal(queryCallCount, 0);
  assert.equal(shieldCallCount, 0, 'a clean cache hit should not even check the shortcode shield');
});
