import { pool } from '../config/db.js';
import { snowflake } from '../utils/snowflake.js';
import { publishClickUpdate } from './realtime.service.js';

export async function handleClickEvent(payload) {
  const id = snowflake.nextId();
  await pool.query(
    `INSERT INTO click_events (id, short_code, ip_hash, user_agent, referrer, clicked_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id.toString(),
      payload.shortCode,
      payload.ipHash || null,
      payload.userAgent || null,
      payload.referrer || null,
      payload.clickedAt ? new Date(payload.clickedAt) : new Date(),
    ]
  );

  const { rows } = await pool.query(
    `UPDATE urls SET click_count = click_count + 1
     WHERE short_code = $1
     RETURNING user_id, click_count`,
    [payload.shortCode]
  );

  if (rows.length > 0) {
    const { user_id: userId, click_count: clickCount } = rows[0];
    // Fire-and-forget - a failed real-time push must never fail click
    // processing itself, the count is already durably saved in Postgres.
    publishClickUpdate({ shortCode: payload.shortCode, userId, clickCount }).catch(() => {});
  }
}
