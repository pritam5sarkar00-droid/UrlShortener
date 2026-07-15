import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeWithGemini } from '../../src/services/pageSummary.service.js';

const originalFetch = global.fetch;
const originalKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
});

function mockGeminiResponse(text) {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  });
}

test('returns nulls when no API key is configured, without calling fetch', async () => {
  delete process.env.GEMINI_API_KEY;
  let fetchCalled = false;
  global.fetch = async () => { fetchCalled = true; };

  const result = await summarizeWithGemini({ title: 'Test', textSample: 'Some content' });

  assert.equal(result.summary, null);
  assert.equal(result.keyTopics, null);
  assert.equal(fetchCalled, false);
});

test('returns nulls when there is no text sample, without calling fetch', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  let fetchCalled = false;
  global.fetch = async () => { fetchCalled = true; };

  const result = await summarizeWithGemini({ title: 'Test', textSample: null });
  assert.equal(fetchCalled, false);
  assert.equal(result.summary, null);
});

test('parses a clean JSON response correctly', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  mockGeminiResponse('{"summary": "A two sentence summary. Here is the second one.", "keyTopics": ["algorithms", "graphs"]}');

  const result = await summarizeWithGemini({ title: 'Dijkstra', textSample: 'shortest path algorithm content' });

  assert.equal(result.summary, 'A two sentence summary. Here is the second one.');
  assert.deepEqual(result.keyTopics, ['algorithms', 'graphs']);
});

test('strips markdown code fences before parsing', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  mockGeminiResponse('```json\n{"summary": "Fenced response.", "keyTopics": ["topic1"]}\n```');

  const result = await summarizeWithGemini({ title: 'Test', textSample: 'content' });
  assert.equal(result.summary, 'Fenced response.');
});

test('extracts the JSON block even with surrounding prose', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  mockGeminiResponse('Sure, here is the summary:\n{"summary": "Extracted anyway.", "keyTopics": ["a", "b"]}\nHope that helps!');

  const result = await summarizeWithGemini({ title: 'Test', textSample: 'content' });
  assert.equal(result.summary, 'Extracted anyway.');
});

test('returns nulls when the response is not valid JSON at all', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  mockGeminiResponse('I cannot summarize this content.');

  const result = await summarizeWithGemini({ title: 'Test', textSample: 'content' });
  assert.equal(result.summary, null);
  assert.equal(result.keyTopics, null);
});

test('returns nulls when the JSON is valid but missing expected fields', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  mockGeminiResponse('{"foo": "bar"}');

  const result = await summarizeWithGemini({ title: 'Test', textSample: 'content' });
  assert.equal(result.summary, null);
});

test('returns nulls on a non-2xx API response rather than throwing', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  global.fetch = async () => ({ ok: false, status: 429 });

  const result = await summarizeWithGemini({ title: 'Test', textSample: 'content' });
  assert.equal(result.summary, null);
});

test('returns nulls on a network failure rather than throwing', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  global.fetch = async () => { throw new Error('network down'); };

  const result = await summarizeWithGemini({ title: 'Test', textSample: 'content' });
  assert.equal(result.summary, null);
});

test('truncates an oversized keyTopics array to 5 items', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  mockGeminiResponse('{"summary": "ok", "keyTopics": ["a","b","c","d","e","f","g"]}');

  const result = await summarizeWithGemini({ title: 'Test', textSample: 'content' });
  assert.equal(result.keyTopics.length, 5);
});
