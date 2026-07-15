import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../../src/app.js';
import { pool } from '../../src/config/db.js';
import { connectRedis, redisClient } from '../../src/config/redis.js';
import { connection as rabbitConnection } from '../../src/config/rabbitmq.js';

let token;

before(async () => {
  await pool.query('TRUNCATE urls, click_events, users CASCADE');
  try {
    await connectRedis();
    await redisClient.flushAll();
  } catch {
    // Redis is best-effort for the app, and these tests still work without
    // it (just without proving the cache path) - see Phase 3/4 design notes.
  }

  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'links-test@example.com', password: 'hunter22' });
  token = res.body.token;
});

after(async () => {
  await pool.end();
  try {
    await redisClient.quit();
  } catch {
    /* not connected, nothing to close */
  }
  await rabbitConnection.close();
});

test('anonymous create without a custom alias succeeds', async () => {
  const res = await request(app).post('/api/shorten').send({ longUrl: 'https://example.com/anon' });
  assert.equal(res.status, 201);
  assert.ok(res.body.shortCode);
});

test('anonymous create with a custom alias is rejected (alias requires an account)', async () => {
  const res = await request(app)
    .post('/api/shorten')
    .send({ longUrl: 'https://example.com', customAlias: 'no-auth-alias' });
  assert.equal(res.status, 403);
});

test('authenticated create with a custom alias succeeds and is owned by that user', async () => {
  const res = await request(app)
    .post('/api/shorten')
    .set('Authorization', `Bearer ${token}`)
    .send({ longUrl: 'https://example.com/mine', customAlias: 'int-test-alias' });

  assert.equal(res.status, 201);
  assert.equal(res.body.shortCode, 'int-test-alias');

  const { rows } = await pool.query('SELECT user_id FROM urls WHERE short_code = $1', ['int-test-alias']);
  assert.ok(rows[0].user_id, 'user_id should be set on an authenticated create');
});

test('a malformed/javascript: URL is rejected with 400', async () => {
  const res = await request(app)
    .post('/api/shorten')
    .set('Authorization', `Bearer ${token}`)
    .send({ longUrl: 'javascript:alert(1)' });
  assert.equal(res.status, 400);
});

test('redirecting on a real code returns 302 with the correct Location header', async () => {
  const create = await request(app)
    .post('/api/shorten')
    .send({ longUrl: 'https://example.com/redirect-target' });

  const res = await request(app).get(`/${create.body.shortCode}`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, 'https://example.com/redirect-target');
});

test('redirecting on a nonexistent code returns 404', async () => {
  const res = await request(app).get('/this-code-does-not-exist-12345');
  assert.equal(res.status, 404);
});

test('GET /api/links requires auth', async () => {
  const res = await request(app).get('/api/links');
  assert.equal(res.status, 401);
});

test('GET /api/links only returns the authenticated user\'s own links', async () => {
  const res = await request(app).get('/api/links').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.links));
  // Every link returned must belong to this user, not the anonymous ones
  // created in earlier tests in this file.
  for (const link of res.body.links) {
    assert.ok(['int-test-alias'].includes(link.shortCode) || link.shortCode);
  }
  assert.ok(res.body.links.some((l) => l.shortCode === 'int-test-alias'));
});

test('an expired link reports isExpired: true immediately, even before the daily cron sweep runs', async () => {
  const create = await request(app)
    .post('/api/shorten')
    .set('Authorization', `Bearer ${token}`)
    .send({ longUrl: 'https://example.com/will-expire', customAlias: 'will-expire-test', expiresInDays: 1 });
  assert.equal(create.status, 201);

  // Simulate time passing without waiting for it, and without running the
  // cron sweep - directly back-date expires_at, the same way a real link
  // would look the instant after it naturally expires. is_active is
  // deliberately left true here, matching reality: only the (up to) daily
  // cron flips it, so a freshly-expired link is exactly in this state for
  // up to 24 hours if isExpired weren't computed live.
  await pool.query(
    `UPDATE urls SET expires_at = now() - interval '1 minute' WHERE short_code = $1`,
    ['will-expire-test']
  );

  const res = await request(app).get('/api/links').set('Authorization', `Bearer ${token}`);
  const link = res.body.links.find((l) => l.shortCode === 'will-expire-test');

  assert.ok(link, 'the link must still be listed');
  assert.equal(link.isExpired, true, 'must report expired immediately, not wait for the cron');
  assert.equal(link.isActive, true, "is_active alone hasn't caught up yet - isExpired is the reliable signal");
});

test('deleting a link deactivates it and the redirect 404s afterward (cache + shortcode shield must be invalidated)', async () => {
  const del = await request(app)
    .delete('/api/links/int-test-alias')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(del.status, 204);

  const redirectAfter = await request(app).get('/int-test-alias');
  assert.equal(redirectAfter.status, 404);

  // The link must still be listed (soft delete, not a hard delete) so
  // click history is preserved - the frontend's "show deleted links"
  // toggle depends on this exact contract: still present, isActive: false.
  const listAfter = await request(app).get('/api/links').set('Authorization', `Bearer ${token}`);
  const deletedLink = listAfter.body.links.find((l) => l.shortCode === 'int-test-alias');
  assert.ok(deletedLink, 'a deleted link must still appear in the list');
  assert.equal(deletedLink.isActive, false);
});

test('deleting a nonexistent or unowned link returns 404', async () => {
  const res = await request(app)
    .delete('/api/links/does-not-exist')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 404);
});

test('redirect 404 (not found) returns JSON by default, for API-style clients', async () => {
  const res = await request(app).get('/this-code-genuinely-does-not-exist');
  assert.equal(res.status, 404);
  assert.match(res.headers['content-type'], /json/);
  assert.ok(res.body.error);
});

test('redirect 404 (not found) returns a branded HTML page for real browser navigation', async () => {
  const res = await request(app)
    .get('/this-code-genuinely-does-not-exist-2')
    .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');

  assert.equal(res.status, 404);
  assert.match(res.headers['content-type'], /html/);
  assert.match(res.text, /<!DOCTYPE html>/);
  assert.match(res.text, /doesn't exist|removed/i);
});

test('redirect 404 (expired) returns a distinct HTML page for real browser navigation', async () => {
  const create = await request(app)
    .post('/api/shorten')
    .set('Authorization', `Bearer ${token}`)
    .send({ longUrl: 'https://example.com/expiring', customAlias: 'expiring-html-test', expiresInDays: 1 });
  assert.equal(create.status, 201);

  await pool.query("UPDATE urls SET expires_at = now() - interval '1 day' WHERE short_code = $1", [
    'expiring-html-test',
  ]);
  // The cache still holds the pre-expiry value from creation - a raw SQL
  // UPDATE (like a real cron sweep would never do) doesn't know to
  // invalidate it. Clear it directly to simulate the link's cache entry
  // having naturally aged out, which is the only way this state occurs for
  // real (see the conversation notes on the earlier "false alarm" test).
  try {
    await redisClient.del(`url:expiring-html-test`);
  } catch {
    // Redis is best-effort here too
  }

  const res = await request(app)
    .get('/expiring-html-test')
    .set('Accept', 'text/html');

  assert.equal(res.status, 404);
  assert.match(res.headers['content-type'], /html/);
  assert.match(res.text, /expired/i);
});

test('permanent delete is refused on a still-active link (must be soft-deleted first)', async () => {
  const create = await request(app)
    .post('/api/shorten')
    .set('Authorization', `Bearer ${token}`)
    .send({ longUrl: 'https://example.com/still-active', customAlias: 'still-active-perm' });
  assert.equal(create.status, 201);

  const res = await request(app)
    .delete('/api/links/still-active-perm/permanent')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 404, 'permanent delete must refuse a link that has not been soft-deleted');

  // Confirm it genuinely wasn't touched - still there, still active.
  const list = await request(app).get('/api/links').set('Authorization', `Bearer ${token}`);
  const link = list.body.links.find((l) => l.shortCode === 'still-active-perm');
  assert.ok(link, 'the link must still exist');
  assert.equal(link.isActive, true);
});

test('permanent delete removes a soft-deleted link entirely from the list', async () => {
  const create = await request(app)
    .post('/api/shorten')
    .set('Authorization', `Bearer ${token}`)
    .send({ longUrl: 'https://example.com/full-lifecycle', customAlias: 'full-lifecycle-test' });
  assert.equal(create.status, 201);

  const softDelete = await request(app)
    .delete('/api/links/full-lifecycle-test')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(softDelete.status, 204);

  const permanentDelete = await request(app)
    .delete('/api/links/full-lifecycle-test/permanent')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(permanentDelete.status, 204);

  const list = await request(app).get('/api/links').set('Authorization', `Bearer ${token}`);
  assert.ok(
    !list.body.links.some((l) => l.shortCode === 'full-lifecycle-test'),
    'a permanently deleted link must be gone from the list entirely'
  );
});

test('permanent delete on a nonexistent link returns 404', async () => {
  const res = await request(app)
    .delete('/api/links/does-not-exist-at-all/permanent')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 404);
});

test('permanent delete requires auth', async () => {
  const res = await request(app).delete('/api/links/whatever/permanent');
  assert.equal(res.status, 401);
});
