import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchPageMetadata } from '../../src/services/pageMetadata.service.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function htmlResponse(html, contentType = 'text/html') {
  return {
    ok: true,
    status: 200,
    headers: { get: (h) => (h === 'content-type' ? contentType : null) },
    body: {
      getReader: () => {
        let sent = false;
        return {
          read: async () => {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: Buffer.from(html) };
          },
          cancel: async () => {},
        };
      },
    },
  };
}

test('succeeds on the first attempt without retrying', async () => {
  let callCount = 0;
  global.fetch = async () => {
    callCount++;
    return htmlResponse('<html><title>Test Page</title><body>hello world</body></html>');
  };

  const result = await fetchPageMetadata('https://example.com');

  assert.equal(callCount, 1, 'must not retry on success');
  assert.equal(result.title, 'Test Page');
});

test('retries once on a network error and succeeds the second time', async () => {
  let callCount = 0;
  global.fetch = async () => {
    callCount++;
    if (callCount === 1) throw new Error('ECONNRESET');
    return htmlResponse('<html><title>Recovered</title><body>content</body></html>');
  };

  const result = await fetchPageMetadata('https://example.com');

  assert.equal(callCount, 2, 'should retry exactly once after a network error');
  assert.equal(result.title, 'Recovered');
});

test('retries once on a timeout (AbortError) and succeeds the second time', async () => {
  let callCount = 0;
  global.fetch = async () => {
    callCount++;
    if (callCount === 1) {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }
    return htmlResponse('<html><title>Recovered from timeout</title></html>');
  };

  const result = await fetchPageMetadata('https://example.com');

  assert.equal(callCount, 2);
  assert.equal(result.title, 'Recovered from timeout');
});

test('does NOT retry a deterministic block (non-2xx status)', async () => {
  let callCount = 0;
  global.fetch = async () => {
    callCount++;
    return { ok: false, status: 403, headers: { get: () => null } };
  };

  const result = await fetchPageMetadata('https://example.com');

  assert.equal(callCount, 1, 'a 403 will fail the same way again immediately - retrying wastes time for nothing');
  assert.equal(result.title, null);
  assert.equal(result.category, 'Other', 'category still resolves from the hostname even on a blocked fetch');
});

test('does NOT retry a deterministic block (wrong content-type)', async () => {
  let callCount = 0;
  global.fetch = async () => {
    callCount++;
    return { ok: true, status: 200, headers: { get: () => 'application/json' } };
  };

  await fetchPageMetadata('https://example.com/api/data');
  assert.equal(callCount, 1);
});

test('does NOT retry when blocked by the SSRF guard', async () => {
  let callCount = 0;
  global.fetch = async () => { callCount++; return htmlResponse('<title>should never get here</title>'); };

  const result = await fetchPageMetadata('http://169.254.169.254/latest/meta-data/');

  assert.equal(callCount, 0, 'the SSRF guard blocks before any fetch attempt at all');
  assert.equal(result.title, null);
  assert.equal(result.category, 'Other', 'even an SSRF-blocked URL still gets a category from its literal hostname');
});

test('falls back to hostname-based category (never null) when both fetch attempts fail', async () => {
  global.fetch = async () => { throw new Error('network down'); };

  const result = await fetchPageMetadata('https://example.com');

  assert.equal(result.title, null);
  assert.equal(result.category, 'Other', 'example.com matches no domain rule and has no title to keyword-match');
  assert.equal(result.wordCount, 0);
});

test('falls back to a real domain category (not just "Other") when a recognized domain blocks the fetch', async () => {
  global.fetch = async () => ({ ok: false, status: 403, headers: { get: () => null } });

  const result = await fetchPageMetadata('https://en.wikipedia.org/wiki/Some_Page');

  assert.equal(result.title, null);
  assert.equal(result.category, 'Education', 'hostname-based categorization needs no successful fetch');
});
