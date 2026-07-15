import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../../src/app.js';
import { pool } from '../../src/config/db.js';
import { connectRedis, redisClient } from '../../src/config/redis.js';
import { connection as rabbitConnection } from '../../src/config/rabbitmq.js';

before(async () => {
  await pool.query('TRUNCATE users CASCADE');
  // The rate limiter on /api/auth/* needs a connected Redis client - without
  // this, RedisStore's lazy construction throws "the client is closed".
  await connectRedis();
});

after(async () => {
  await pool.end();
  await redisClient.quit();
  // app.js pulls in config/rabbitmq.js transitively (via the redirect route),
  // which opens a connection at import time regardless of whether any test
  // actually triggers a redirect - close it or the process never exits.
  await rabbitConnection.close();
});

test('register: creates a new user and returns a token', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'auth-test@example.com', password: 'hunter22' });

  assert.equal(res.status, 201);
  assert.ok(res.body.token);
  assert.equal(res.body.user.email, 'auth-test@example.com');
});

test('register: rejects a duplicate email with 409', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'auth-test@example.com', password: 'hunter22' });

  assert.equal(res.status, 409);
});

test('register: rejects a password under 8 characters with 400', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'short-pw@example.com', password: 'short' });

  assert.equal(res.status, 400);
});

test('login: succeeds with correct credentials, case-insensitive email', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'AUTH-TEST@example.com', password: 'hunter22' });

  assert.equal(res.status, 200);
  assert.ok(res.body.token);
});

test('login: rejects an incorrect password with 401', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'auth-test@example.com', password: 'wrong-password' });

  assert.equal(res.status, 401);
});

test('login: rejects a nonexistent email with 401 (not 404 - don\'t leak which emails exist)', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'nobody@example.com', password: 'whatever1' });

  assert.equal(res.status, 401);
});

test('login: a Google-only account (no password set) gets a clean 401, not a 500', async () => {
  // Simulates exactly what loginWithGoogle() creates for a brand-new
  // Google account: email + google_id, no password_hash at all. Regression
  // test for a real bug: bcrypt.compare(password, null) THROWS rather than
  // returning false, which was surfacing as an unhandled 500 instead of a
  // normal "wrong credentials" response for anyone who signed up via Google
  // only and then tried the regular password login form.
  await pool.query(
    `INSERT INTO users (email, google_id) VALUES ($1, $2)`,
    ['google-only@example.com', 'google-sub-12345']
  );

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'google-only@example.com', password: 'anything-at-all' });

  assert.equal(res.status, 401, 'must be a clean 401, not a crash');
  assert.equal(res.body.error, 'Invalid email or password');
});
