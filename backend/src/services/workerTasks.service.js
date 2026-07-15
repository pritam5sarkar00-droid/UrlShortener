import cron from 'node-cron';

import { pool } from '../config/db.js';
import { removeFromShortcodeShield } from '../config/redis.js';
import { deleteCachedUrl } from './cache.service.js';
import { handleClickEvent } from './clickEvent.service.js';
import { publishLinkDeleted } from './realtime.service.js';
import { CLICK_QUEUE, createChannelWrapper } from '../config/rabbitmq.js';
import {
  clickEventsProcessedTotal,
  clickEventsFailedTotal,
  expirySweepDeactivatedTotal,
} from '../config/metrics.js';

// Consumes click-analytics, dead-lettering anything that fails processing
// instead of losing it or retrying forever. See Phase 5 for the design notes.
export function startClickConsumer() {
  const channelWrapper = createChannelWrapper(async (channel) => {
    await channel.prefetch(10);
    await channel.consume(CLICK_QUEUE, async (msg) => {
      if (!msg) return;
      try {
        const payload = JSON.parse(msg.content.toString());
        await handleClickEvent(payload);
        clickEventsProcessedTotal.inc();
        channelWrapper.ack(msg);
      } catch (err) {
        console.error('[worker] failed to process message, sending to DLQ', err);
        clickEventsFailedTotal.inc();
        // false, false = don't requeue -> routes straight to the dead-letter exchange
        channelWrapper.nack(msg, false, false);
      }
    });
  });
  console.log('[worker] click consumer ready, listening on', CLICK_QUEUE);
  return channelWrapper;
}

// Runs daily at 02:00 - deactivates expired links and cleans them out of
// Redis + the shortcode shield so they don't linger as stale "maybe exists" entries.
export function scheduleExpirySweep() {
  cron.schedule('0 2 * * *', async () => {
    try {
      const { rows } = await pool.query(
        `UPDATE urls SET is_active = false
         WHERE is_active = true AND expires_at IS NOT NULL AND expires_at < now()
         RETURNING short_code, user_id`
      );
      for (const row of rows) {
        await deleteCachedUrl(row.short_code);
        await removeFromShortcodeShield(row.short_code);
        // Same real-time signal a manual delete sends - if the owner has a
        // dashboard open when their link naturally expires, it should
        // update live too, not just when they click Delete themselves.
        publishLinkDeleted({ shortCode: row.short_code, userId: row.user_id }).catch(() => {});
      }
      console.log(`[worker] expiry sweep deactivated ${rows.length} link(s)`);
      expirySweepDeactivatedTotal.inc(rows.length);
    } catch (err) {
      console.error('[worker] expiry sweep failed', err);
    }
  });
  console.log('[worker] expiry sweep scheduled for 02:00 daily');
}
