import { pool } from '../config/db.js';
import { snowflake } from '../utils/snowflake.js';
import { encode as base62Encode } from '../utils/base62.js';
import { getCachedUrl, setCachedUrl, deleteCachedUrl } from './cache.service.js';
import { addToShortcodeShield, existsInShortcodeShield, removeFromShortcodeShield } from '../config/redis.js';
import { fetchPageMetadata } from './pageMetadata.service.js';
import { summarizeWithGemini } from './pageSummary.service.js';
import { publishLinkDeleted, publishLinkPermanentlyDeleted, publishLinkEnriched } from './realtime.service.js';
import {
  cacheHitsTotal,
  cacheMissesTotal,
  shortcodeShieldHitsTotal,
  snowflakeIdsGeneratedTotal,
} from '../config/metrics.js';

const DEFAULT_EXPIRY_DAYS = 365;

async function insertUrl({ id, shortCode, longUrl, isCustomAlias, expiresAt, userId }) {
  const { rows } = await pool.query(
    `INSERT INTO urls (id, short_code, long_url, is_custom_alias, expires_at, user_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, short_code, long_url, is_custom_alias, expires_at, created_at, user_id`,
    [id, shortCode, longUrl, isCustomAlias, expiresAt, userId]
  );
  return rows[0];
}

export async function createShortUrl({ longUrl, customAlias, expiresInDays, userId = null }) {
  const expiresAt = new Date(
    Date.now() + (expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000
  );

  // Every row gets a real Snowflake id as its primary key, custom alias or not -
  // it's what the shortcode shield and click_events will key off later.
  const id = snowflake.nextId();
  snowflakeIdsGeneratedTotal.inc();

  let row;
  if (customAlias) {
    row = await insertUrl({ id, shortCode: customAlias, longUrl, isCustomAlias: true, expiresAt, userId });
  } else {
    const shortCode = base62Encode(id);
    try {
      row = await insertUrl({ id, shortCode, longUrl, isCustomAlias: false, expiresAt, userId });
    } catch (err) {
      if (err.code === '23505') {
        // Should be structurally impossible - Snowflake ids are unique per
        // (timestamp, workerId, sequence). If this ever actually fires, it
        // means two instances share a SNOWFLAKE_WORKER_ID - that's a config
        // bug worth surfacing loudly rather than silently retrying.
        throw new Error('Short code collision - check SNOWFLAKE_WORKER_ID is unique per instance');
      }
      throw err;
    }
  }

  // Write-through: populate the cache immediately so the very first redirect
  // is already a hit, instead of forcing a guaranteed-miss round trip to Postgres.
  await setCachedUrl(row.short_code, { longUrl: row.long_url, expiresAt: row.expires_at });

  // Mark the code as seen so the redirect path can shield Postgres from
  // requests for codes that definitely never existed.
  await addToShortcodeShield(row.short_code);

  // Fire-and-forget: fetch the target page's title + category in the
  // background. Deliberately not awaited - a slow or unresponsive target
  // site must never add latency to the create response. If it fails, the
  // link just keeps title/summary/reading-time as null - category still
  // gets set from the hostname alone (see fetchPageMetadata), so it's never
  // blank, only less specific ('Other') than a successful fetch would give.
  enrichLinkMetadata(row.id, row.long_url, row.short_code, row.user_id).catch((err) =>
    console.error('[enrichment] unexpected failure (non-fatal):', err.message)
  );

  return row;
}

const WORDS_PER_MINUTE = 200;

async function enrichLinkMetadata(id, longUrl, shortCode, userId) {
  const { title, category, textSample, wordCount } = await fetchPageMetadata(longUrl);

  // Reading time is pure arithmetic - no AI call needed, so it's always
  // available whenever the page fetch itself succeeded, regardless of
  // whether Gemini is configured or reachable.
  const readingTimeMinutes = wordCount > 0 ? Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE)) : null;

  const { summary, keyTopics } = await summarizeWithGemini({ title, textSample });

  // No early-return-on-total-failure here: fetchPageMetadata() guarantees
  // category is always a real string ('Other' at worst), even when the
  // fetch itself was blocked/timed out - see its doc comment - so there's
  // always at least the category worth persisting, never a reason to skip
  // this write entirely.
  await pool.query(
    `UPDATE urls SET title = $1, category = $2, summary = $3, key_topics = $4, reading_time_minutes = $5
     WHERE id = $6`,
    [title, category, summary, keyTopics, readingTimeMinutes, id]
  );

  // Push the freshly enriched fields to any open dashboard for this owner,
  // live - the same treatment clicks and deletes already get. Fire-and-
  // forget, same as every other realtime publish call: a failed broadcast
  // must never fail enrichment itself, the UPDATE above already succeeded.
  publishLinkEnriched({ shortCode, userId, title, category, summary, keyTopics, readingTimeMinutes }).catch(() => {});
}

export async function getUrlByCode(shortCode) {
  // NOTE: cached entries only store longUrl + expiresAt, not is_active - a
  // cache hit therefore always reports is_active: true. That's safe because
  // deactivateLink() and permanentlyDeleteLink() (below) both call
  // deleteCachedUrl() the moment a link stops being active, so a cached
  // entry existing at all is proof it was active as of its last write.
  const cached = await getCachedUrl(shortCode);
  if (cached) {
    const stillValid = !cached.expiresAt || new Date(cached.expiresAt) > new Date();
    if (stillValid) {
      console.log(`[cache] hit for ${shortCode}`);
      cacheHitsTotal.inc();
      return {
        short_code: shortCode,
        long_url: cached.longUrl,
        is_active: true,
        expires_at: cached.expiresAt,
      };
    }
    // The link expired since this was cached - don't trust a stale hit,
    // evict it and fall through to Postgres, the actual source of truth.
    await deleteCachedUrl(shortCode);
  }

  console.log(`[cache] miss for ${shortCode}`);
  cacheMissesTotal.inc();

  const maybeExists = await existsInShortcodeShield(shortCode);
  if (!maybeExists) {
    console.log(`[shield] DEFINITELY ABSENT ${shortCode} - skipping Postgres entirely`);
    shortcodeShieldHitsTotal.inc();
    return null;
  }

  const { rows } = await pool.query(
    `SELECT short_code, long_url, is_active, expires_at FROM urls WHERE short_code = $1`,
    [shortCode]
  );
  const row = rows[0] ?? null;

  const isUsable = row && row.is_active && (!row.expires_at || new Date(row.expires_at) > new Date());
  if (isUsable) {
    await setCachedUrl(row.short_code, { longUrl: row.long_url, expiresAt: row.expires_at });
  }

  return row;
}

export async function listLinksForUser(userId) {
  const { rows } = await pool.query(
    `SELECT short_code, long_url, click_count, is_custom_alias, is_active, expires_at, created_at,
            title, category, summary, key_topics, reading_time_minutes,
            (expires_at IS NOT NULL AND expires_at < now()) AS is_expired
     FROM urls WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

// Soft delete, scoped to the owner - the WHERE clause itself enforces
// ownership, so there's no separate "is this their link?" check to forget.
// Closes the gap flagged back in Phase 3: a deactivated link must be evicted
// from the cache and the shortcode shield, or it would keep redirecting from
// cache until it happened to age out on its own.
export async function deactivateLink(shortCode, userId) {
  const { rows } = await pool.query(
    `UPDATE urls SET is_active = false
     WHERE short_code = $1 AND user_id = $2 AND is_active = true
     RETURNING short_code`,
    [shortCode, userId]
  );
  if (rows.length === 0) return false;

  await deleteCachedUrl(shortCode);
  await removeFromShortcodeShield(shortCode);
  // Fire-and-forget - a failed broadcast must never fail the delete itself,
  // the deactivation already succeeded durably in Postgres.
  publishLinkDeleted({ shortCode, userId }).catch(() => {});
  return true;
}

// Truly irreversible - unlike deactivateLink, there's no "show deleted
// links" toggle that can bring this back. The `is_active = false` condition
// in the WHERE clause is the actual safety mechanism, not just a courtesy
// check in application code: it's structurally impossible to permanently
// delete a link that hasn't been soft-deleted first, even if a caller
// skipped the normal UI flow.
//
// click_events for this link are deliberately left in place - they were
// never foreign-keyed to urls (see the schema notes from Phase 0/5), so
// historical analytics survive independently of the link's own lifecycle.
export async function permanentlyDeleteLink(shortCode, userId) {
  const { rows } = await pool.query(
    `DELETE FROM urls WHERE short_code = $1 AND user_id = $2 AND is_active = false RETURNING short_code`,
    [shortCode, userId]
  );
  if (rows.length === 0) return false;

  // Already evicted when the link was deactivated, but defensive/idempotent
  // in case anything (a stale reader, a race) repopulated either since then.
  await deleteCachedUrl(shortCode);
  await removeFromShortcodeShield(shortCode);
  publishLinkPermanentlyDeleted({ shortCode, userId }).catch(() => {});
  return true;
}
