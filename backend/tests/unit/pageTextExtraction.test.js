import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTextSample } from '../../src/services/pageMetadata.service.js';

test('strips tags and counts words in plain body text', () => {
  const html = '<html><body><p>The quick brown fox jumps over the lazy dog</p></body></html>';
  const { text, wordCount } = extractTextSample(html);
  assert.equal(text, 'The quick brown fox jumps over the lazy dog');
  assert.equal(wordCount, 9);
});

test('excludes script and style block content from the word count', () => {
  const html = `<html><head><style>.a { color: red; }</style></head>
    <body><script>console.log('should not be counted at all here');</script>
    <p>Only these four words</p></body></html>`;
  const { text, wordCount } = extractTextSample(html);
  assert.ok(!text.includes('color'), 'style content must be stripped');
  assert.ok(!text.includes('console'), 'script content must be stripped');
  assert.equal(wordCount, 4);
});

test('decodes HTML entities in the extracted text', () => {
  const { text } = extractTextSample('<p>Fish &amp; Chips</p>');
  assert.equal(text, 'Fish & Chips');
});

test('returns zero word count for empty/whitespace-only content', () => {
  const { text, wordCount } = extractTextSample('<html><body>   </body></html>');
  assert.equal(text, '');
  assert.equal(wordCount, 0);
});

test('caps the returned excerpt length while wordCount reflects the full text', () => {
  const longWord = 'word ';
  const html = `<p>${longWord.repeat(2000)}</p>`; // 10,000 chars of content
  const { text, wordCount } = extractTextSample(html);
  assert.ok(text.length <= 4000, 'excerpt must be capped');
  assert.equal(wordCount, 2000, 'word count should reflect the full text, not just the capped excerpt');
});
