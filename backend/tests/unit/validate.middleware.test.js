import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateShortenRequest } from '../../src/middlewares/validate.middleware.js';

function run(body) {
  const req = { body };
  let statusCode = null;
  let payload = null;
  let nextCalled = false;
  const res = {
    status(code) { statusCode = code; return this; },
    json(p) { payload = p; return this; },
  };
  validateShortenRequest(req, res, () => { nextCalled = true; });
  return { nextCalled, statusCode, payload };
}

test('accepts a valid https URL', () => {
  const { nextCalled } = run({ longUrl: 'https://example.com/path' });
  assert.equal(nextCalled, true);
});

test('rejects a non-URL string', () => {
  const { nextCalled, statusCode } = run({ longUrl: 'not-a-url' });
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 400);
});

test('rejects javascript: scheme - this is the actual security check', () => {
  const { nextCalled, statusCode } = run({ longUrl: 'javascript:alert(1)' });
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 400);
});

test('accepts a valid custom alias', () => {
  const { nextCalled } = run({ longUrl: 'https://example.com', customAlias: 'my-brand' });
  assert.equal(nextCalled, true);
});

test('rejects a too-short custom alias', () => {
  const { nextCalled, statusCode } = run({ longUrl: 'https://example.com', customAlias: 'ab' });
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 400);
});

test('rejects a reserved alias', () => {
  const { nextCalled, statusCode } = run({ longUrl: 'https://example.com', customAlias: 'admin' });
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 400);
});

test('accepts a valid expiresInDays', () => {
  const { nextCalled } = run({ longUrl: 'https://example.com', expiresInDays: 30 });
  assert.equal(nextCalled, true);
});

test('rejects a negative expiresInDays', () => {
  const { nextCalled, statusCode } = run({ longUrl: 'https://example.com', expiresInDays: -5 });
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 400);
});

test('rejects an expiresInDays beyond the max', () => {
  const { nextCalled } = run({ longUrl: 'https://example.com', expiresInDays: 999999 });
  assert.equal(nextCalled, false);
});
