import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode } from '../../src/utils/base62.js';

test('round-trips edge-case and arbitrary values', () => {
  const values = [0n, 1n, 61n, 62n, 63n, 123456789n, 9007199254740993n];
  for (const v of values) {
    assert.equal(decode(encode(v)), v, `round-trip failed for ${v}`);
  }
});

test('encode(0) is the first alphabet character, not an empty string', () => {
  assert.equal(encode(0n), '0');
});

test('rejects negative numbers', () => {
  assert.throws(() => encode(-1n));
});

test('rejects invalid characters on decode', () => {
  assert.throws(() => decode('abc!'));
  assert.throws(() => decode('has space'));
});
