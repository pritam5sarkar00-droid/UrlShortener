import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTitle, categorize } from '../../src/services/pageMetadata.service.js';

test('extracts a simple title', () => {
  assert.equal(extractTitle('<html><head><title>Two Sum - LeetCode</title></head></html>'), 'Two Sum - LeetCode');
});

test('decodes common HTML entities in the title', () => {
  assert.equal(extractTitle('<title>Fish &amp; Chips &#39;n&#39; more</title>'), "Fish & Chips 'n' more");
});

test('collapses internal whitespace/newlines', () => {
  assert.equal(extractTitle('<title>\n  Some   Title  \n</title>'), 'Some Title');
});

test('returns null when there is no title tag', () => {
  assert.equal(extractTitle('<html><body>no title here</body></html>'), null);
});

test('returns null for an empty title tag', () => {
  assert.equal(extractTitle('<title></title>'), null);
});

test('categorizes known domains correctly regardless of title', () => {
  assert.equal(categorize('en.wikipedia.org', null), 'Education');
  assert.equal(categorize('www.amazon.com', 'Random Product'), 'Shopping');
  assert.equal(categorize('twitter.com', null), 'Social Media');
  assert.equal(categorize('some.agency.gov', null), 'Government');
  assert.equal(categorize('netflix.com', null), 'Entertainment');
});

test('falls back to keyword matching on the title for unknown domains', () => {
  assert.equal(categorize('example.com', 'Learn Python - Free Course'), 'Education');
  assert.equal(categorize('example.com', 'Buy this deal - 50% off'), 'Shopping');
});

test('falls back to Other when nothing matches', () => {
  assert.equal(categorize('example.com', 'Just a random page'), 'Other');
  assert.equal(categorize('example.com', null), 'Other');
});
