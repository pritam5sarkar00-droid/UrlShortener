import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkUrlAgainstSafeBrowsing } from '../../src/services/safeBrowsing.service.js';

const originalFetch = global.fetch;
const originalKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;

afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  else process.env.GOOGLE_SAFE_BROWSING_API_KEY = originalKey;
});

test('returns checked: false when no API key is configured, without calling fetch', async () => {
  delete process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  let fetchCalled = false;
  global.fetch = async () => { fetchCalled = true; };

  const result = await checkUrlAgainstSafeBrowsing('https://example.com');

  assert.equal(result.checked, false);
  assert.equal(result.flagged, false);
  assert.equal(fetchCalled, false, 'must not call the API when unconfigured');
});

test('reports flagged: false for a clean URL (empty matches)', async () => {
  process.env.GOOGLE_SAFE_BROWSING_API_KEY = 'test-key';
  global.fetch = async () => ({ ok: true, json: async () => ({}) });

  const result = await checkUrlAgainstSafeBrowsing('https://example.com');

  assert.equal(result.checked, true);
  assert.equal(result.flagged, false);
  assert.deepEqual(result.threatTypes, []);
});

test('reports flagged: true with threat types for a matched URL', async () => {
  process.env.GOOGLE_SAFE_BROWSING_API_KEY = 'test-key';
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ matches: [{ threatType: 'MALWARE' }, { threatType: 'SOCIAL_ENGINEERING' }] }),
  });

  const result = await checkUrlAgainstSafeBrowsing('https://evil.example.com');

  assert.equal(result.flagged, true);
  assert.deepEqual(result.threatTypes.sort(), ['MALWARE', 'SOCIAL_ENGINEERING']);
});

test('dedupes repeated threat types', async () => {
  process.env.GOOGLE_SAFE_BROWSING_API_KEY = 'test-key';
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ matches: [{ threatType: 'MALWARE' }, { threatType: 'MALWARE' }] }),
  });

  const result = await checkUrlAgainstSafeBrowsing('https://evil.example.com');
  assert.deepEqual(result.threatTypes, ['MALWARE']);
});

test('throws when the API responds with a non-2xx status', async () => {
  process.env.GOOGLE_SAFE_BROWSING_API_KEY = 'test-key';
  global.fetch = async () => ({ ok: false, status: 403 });

  await assert.rejects(() => checkUrlAgainstSafeBrowsing('https://example.com'));
});

test('propagates a network failure as a rejection', async () => {
  process.env.GOOGLE_SAFE_BROWSING_API_KEY = 'test-key';
  global.fetch = async () => { throw new Error('network down'); };

  await assert.rejects(() => checkUrlAgainstSafeBrowsing('https://example.com'), /network down/);
});
