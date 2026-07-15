import { redisClient } from '../config/redis.js';

const CHANNEL = 'link-events'; // was 'link-clicks' - now carries all link lifecycle events, not just clicks

async function publish(payload) {
  try {
    await redisClient.publish(CHANNEL, JSON.stringify(payload));
  } catch (err) {
    console.error('[realtime] failed to publish (non-fatal):', err.message);
  }
}

/**
 * Publishes a click update. Best-effort - a publish failure (Redis down,
 * pub/sub unsupported by the provider) must never break click processing
 * itself, since the click_count UPDATE already succeeded by the time this
 * is called.
 */
export async function publishClickUpdate({ shortCode, userId, clickCount }) {
  if (!userId) return; // anonymous links have no dashboard to push updates to
  await publish({ type: 'click', shortCode, userId, clickCount });
}

/**
 * Publishes a soft-delete event, so any other open dashboard session for
 * the same user (another tab, another device) can remove the link from its
 * charts and mark it inactive in its table live, without a manual refresh -
 * exactly the same cross-session sync clicks already get.
 */
export async function publishLinkDeleted({ shortCode, userId }) {
  if (!userId) return;
  await publish({ type: 'deleted', shortCode, userId });
}

/** Publishes a permanent-delete event - the link should disappear entirely, everywhere, live. */
export async function publishLinkPermanentlyDeleted({ shortCode, userId }) {
  if (!userId) return;
  await publish({ type: 'permanently_deleted', shortCode, userId });
}

/**
 * Publishes the result of background page enrichment (title, category, AI
 * summary/keyTopics, reading time), so an open dashboard picks it up live
 * instead of only on the next full page reload. This matters more here than
 * for clicks/deletes: enrichLinkMetadata() runs fire-and-forget well after
 * the create response already went out, and the dashboard's own post-create
 * refetch fires immediately after that response - long before the page
 * fetch + Gemini call have had time to finish. Without this event, the
 * fields would only ever appear after a manual reload, and only once
 * enrichment happened to complete before that reload was requested.
 */
export async function publishLinkEnriched({
  shortCode,
  userId,
  title,
  category,
  summary,
  keyTopics,
  readingTimeMinutes,
}) {
  if (!userId) return; // anonymous links have no dashboard to push updates to
  await publish({ type: 'enriched', shortCode, userId, title, category, summary, keyTopics, readingTimeMinutes });
}

/**
 * Subscribes to link lifecycle events (clicks, deletes, permanent deletes)
 * and invokes `onEvent(payload)` for each one, where payload always has a
 * `type` field. Uses a dedicated duplicated connection, since a Redis client
 * in subscriber mode can't run other commands - node-redis's documented
 * pattern for this. Returns the subscriber client so callers can close it on
 * shutdown; resolves to null (rather than throwing) if the subscription
 * can't be established, since some managed Redis providers don't support
 * pub/sub - real-time updates are a nice-to-have layered on top of the
 * dashboard, not something the app depends on.
 */
export async function subscribeToClickUpdates(onEvent) {
  try {
    const subscriber = redisClient.duplicate();
    subscriber.on('error', (err) => console.error('[realtime] subscriber error:', err.message));
    await subscriber.connect();
    await subscriber.subscribe(CHANNEL, (message) => {
      try {
        onEvent(JSON.parse(message));
      } catch (err) {
        console.error('[realtime] failed to handle link event message:', err.message);
      }
    });
    console.log('[realtime] subscribed to link events');
    return subscriber;
  } catch (err) {
    console.error('[realtime] could not subscribe to link events (non-fatal):', err.message);
    return null;
  }
}
