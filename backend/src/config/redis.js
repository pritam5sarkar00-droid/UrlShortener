import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

export const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on('error', (err) => console.error('[redis] client error', err));

export async function connectRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
  return redisClient;
}

// Negative-cache "shield" for short codes, so a flood of lookups for
// codes that plainly don't exist (scanning/enumeration, typos, old links)
// never has to hit Postgres. This was originally built on RedisBloom's
// Cuckoo filter (CF.RESERVE/CF.ADD/CF.DEL/CF.EXISTS), which is a great fit
// for this - but Upstash's managed Redis doesn't load the Bloom module, so
// every one of those commands failed with "Command is not available" and
// the whole subsystem was silently a no-op. Rebuilt on a plain Redis Set
// (SADD/SREM/SISMEMBER) instead: every command here is in Upstash's
// standard command list, so it actually works on that hosting. The
// trade-off is memory - a Set stores real short codes instead of compact
// fingerprints - but at this app's scale (short codes, realistically low
// millions at most) that's negligible, and a Set is also an exact
// membership test with zero false positives, which a probabilistic filter
// can't offer.
export const SHORTCODE_SHIELD_KEY = 'shortcode-shield';

// Sets need no upfront reservation/capacity like a cuckoo filter did - the
// key is created implicitly on the first SADD. Kept as a named startup
// step anyway so server.js doesn't need to change and so the log line
// still confirms the shield is wired up.
export async function ensureShortcodeShield(key = SHORTCODE_SHIELD_KEY) {
  console.log(`[redis] shortcode shield "${key}" ready (Set-based, Upstash-compatible)`);
}

// Called once per created short code. Best-effort - a failed add just means
// that one code won't benefit from shielding, never a reason to fail the create.
export async function addToShortcodeShield(value, key = SHORTCODE_SHIELD_KEY) {
  try {
    await redisClient.sAdd(key, value);
  } catch (err) {
    console.error('[redis] shortcode shield add failed (non-fatal):', err.message);
  }
}

// Called when a link expires/gets deleted, so a stale code doesn't linger as
// a "maybe exists" entry forever. Best-effort, same fail-open philosophy.
export async function removeFromShortcodeShield(value, key = SHORTCODE_SHIELD_KEY) {
  try {
    await redisClient.sRem(key, value);
  } catch (err) {
    console.error('[redis] shortcode shield remove failed (non-fatal):', err.message);
  }
}
// Returns false ONLY when the shield can positively guarantee the value is
// absent - that's the one case it's safe to skip Postgres entirely. Any
// error (Redis down, etc.) fails OPEN by returning true, so a broken/missing
// shield degrades to "no shielding", never to "wrongly reject real codes".
export async function existsInShortcodeShield(value, key = SHORTCODE_SHIELD_KEY) {
  try {
    return await redisClient.sIsMember(key, value);
  } catch (err) {
    console.error('[redis] shortcode shield exists check failed, assuming maybe-exists (non-fatal):', err.message);
    return true;
  }
}
