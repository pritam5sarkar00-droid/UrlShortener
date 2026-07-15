import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SnowflakeGenerator } from '../../src/utils/snowflake.js';

test('generates unique, strictly increasing IDs under a tight loop', () => {
  const gen = new SnowflakeGenerator(1);
  const N = 50_000;
  const ids = Array.from({ length: N }, () => gen.nextId());

  assert.equal(new Set(ids.map(String)).size, N, 'all ids must be unique');

  for (let i = 1; i < ids.length; i++) {
    assert.ok(ids[i] > ids[i - 1], `id ${i} must be strictly greater than id ${i - 1}`);
  }
});

test('rejects an out-of-range worker id', () => {
  assert.throws(() => new SnowflakeGenerator(1024)); // max valid is 1023
  assert.throws(() => new SnowflakeGenerator(-1));
  assert.doesNotThrow(() => new SnowflakeGenerator(1023));
  assert.doesNotThrow(() => new SnowflakeGenerator(0));
});

test('different worker ids never collide, even at the same instant', () => {
  const genA = new SnowflakeGenerator(1);
  const genB = new SnowflakeGenerator(2);
  const idA = genA.nextId();
  const idB = genB.nextId();
  assert.notEqual(idA, idB);
});
