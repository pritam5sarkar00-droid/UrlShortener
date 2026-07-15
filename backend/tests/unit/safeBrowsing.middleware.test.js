import { test } from 'node:test';
import assert from 'node:assert/strict';

const SRC = '../../src';

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

test('allows the request through when the URL is clean', async (t) => {
  t.mock.module(`${SRC}/services/safeBrowsing.service.js`, {
    namedExports: {
      checkUrlAgainstSafeBrowsing: async () => ({ checked: true, flagged: false, threatTypes: [] }),
    },
  });
  const { checkUrlSafety } = await import(`${SRC}/middlewares/safeBrowsing.middleware.js?v=${Date.now()}a`);

  const req = { body: { longUrl: 'https://example.com' } };
  const res = makeRes();
  let nextCalled = false;
  await checkUrlSafety(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('blocks the request with 400 and the threat types when the URL is flagged', async (t) => {
  t.mock.module(`${SRC}/services/safeBrowsing.service.js`, {
    namedExports: {
      checkUrlAgainstSafeBrowsing: async () => ({ checked: true, flagged: true, threatTypes: ['MALWARE'] }),
    },
  });
  const { checkUrlSafety } = await import(`${SRC}/middlewares/safeBrowsing.middleware.js?v=${Date.now()}b`);

  const req = { body: { longUrl: 'https://evil.example.com' } };
  const res = makeRes();
  let nextCalled = false;
  await checkUrlSafety(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false, 'must not call next() for a flagged URL');
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body.threatTypes, ['MALWARE']);
});

test('allows the request through when the service is not configured (skipped)', async (t) => {
  t.mock.module(`${SRC}/services/safeBrowsing.service.js`, {
    namedExports: {
      checkUrlAgainstSafeBrowsing: async () => ({ checked: false, flagged: false, threatTypes: [] }),
    },
  });
  const { checkUrlSafety } = await import(`${SRC}/middlewares/safeBrowsing.middleware.js?v=${Date.now()}c`);

  const req = { body: { longUrl: 'https://example.com' } };
  const res = makeRes();
  let nextCalled = false;
  await checkUrlSafety(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
});

test('FAILS OPEN: allows the request through when the safety check itself throws', async (t) => {
  t.mock.module(`${SRC}/services/safeBrowsing.service.js`, {
    namedExports: {
      checkUrlAgainstSafeBrowsing: async () => { throw new Error('Safe Browsing API returned HTTP 500'); },
    },
  });
  const { checkUrlSafety } = await import(`${SRC}/middlewares/safeBrowsing.middleware.js?v=${Date.now()}d`);

  const req = { body: { longUrl: 'https://example.com' } };
  const res = makeRes();
  let nextCalled = false;
  await checkUrlSafety(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true, 'a broken/unreachable Safe Browsing API must never block link creation');
  assert.equal(res.statusCode, null);
});
