import { redisClient } from '../config/redis.js';

const CACHE_PREFIX = 'url:';

function cacheKey(shortCode) {
  return `${CACHE_PREFIX}${shortCode}`;
}

// No TTL by design - these mappings are immutable once created, so we let
// Redis's allkeys-lru eviction policy decide what stays hot instead of
// re-fetching from Postgres on an arbitrary timer. Expiry is still enforced
// logically by checking the `expiresAt` we store alongside the URL.
export async function setCachedUrl(shortCode, { longUrl, expiresAt }) {
  try {
    await redisClient.set(cacheKey(shortCode), JSON.stringify({ longUrl, expiresAt }));
  } catch (err) {
    // Cache writes are best-effort - a Redis hiccup should never break a
    // create or a redirect. Worst case we just fall through to Postgres.
    console.error('[cache] failed to set', shortCode, err.message);
  }
}

export async function getCachedUrl(shortCode) {
  try {
    const value = await redisClient.get(cacheKey(shortCode));
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.error('[cache] failed to get', shortCode, err.message);
    return null; // any cache error is treated as a miss, fall back to Postgres
  }
}

export async function deleteCachedUrl(shortCode) {
  try {
    await redisClient.del(cacheKey(shortCode));
  } catch (err) {
    console.error('[cache] failed to delete', shortCode, err.message);
  }
}
