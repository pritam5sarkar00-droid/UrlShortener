import { test } from 'node:test';
import assert from 'node:assert/strict';

const SRC = '../../src';

test('publishClickUpdate does not publish for anonymous links (no userId)', async (t) => {
  let publishCalled = false;
  t.mock.module(`${SRC}/config/redis.js`, {
    namedExports: {
      redisClient: { publish: async () => { publishCalled = true; } },
    },
  });

  const { publishClickUpdate } = await import(`${SRC}/services/realtime.service.js?v=${Date.now()}a`);
  await publishClickUpdate({ shortCode: 'abc', userId: null, clickCount: 1 });

  assert.equal(publishCalled, false);
});

test('publishClickUpdate publishes the correct JSON payload for an owned link', async (t) => {
  let published = null;
  t.mock.module(`${SRC}/config/redis.js`, {
    namedExports: {
      redisClient: {
        publish: async (channel, message) => { published = { channel, message }; },
      },
    },
  });

  const { publishClickUpdate } = await import(`${SRC}/services/realtime.service.js?v=${Date.now()}b`);
  await publishClickUpdate({ shortCode: 'abc123', userId: 'user-1', clickCount: 5 });

  assert.equal(published.channel, 'link-events');
  assert.deepEqual(JSON.parse(published.message), {
    type: 'click',
    shortCode: 'abc123',
    userId: 'user-1',
    clickCount: 5,
  });
});

test('publishLinkDeleted publishes a "deleted" event on the same channel', async (t) => {
  let published = null;
  t.mock.module(`${SRC}/config/redis.js`, {
    namedExports: {
      redisClient: { publish: async (channel, message) => { published = { channel, message }; } },
    },
  });

  const { publishLinkDeleted } = await import(`${SRC}/services/realtime.service.js?v=${Date.now()}e`);
  await publishLinkDeleted({ shortCode: 'abc123', userId: 'user-1' });

  assert.equal(published.channel, 'link-events');
  assert.deepEqual(JSON.parse(published.message), { type: 'deleted', shortCode: 'abc123', userId: 'user-1' });
});

test('publishLinkDeleted does not publish for anonymous links (no userId)', async (t) => {
  let publishCalled = false;
  t.mock.module(`${SRC}/config/redis.js`, {
    namedExports: { redisClient: { publish: async () => { publishCalled = true; } } },
  });

  const { publishLinkDeleted } = await import(`${SRC}/services/realtime.service.js?v=${Date.now()}f`);
  await publishLinkDeleted({ shortCode: 'abc', userId: null });

  assert.equal(publishCalled, false);
});

test('publishLinkPermanentlyDeleted publishes a "permanently_deleted" event', async (t) => {
  let published = null;
  t.mock.module(`${SRC}/config/redis.js`, {
    namedExports: {
      redisClient: { publish: async (channel, message) => { published = { channel, message }; } },
    },
  });

  const { publishLinkPermanentlyDeleted } = await import(`${SRC}/services/realtime.service.js?v=${Date.now()}g`);
  await publishLinkPermanentlyDeleted({ shortCode: 'abc123', userId: 'user-1' });

  assert.deepEqual(JSON.parse(published.message), {
    type: 'permanently_deleted',
    shortCode: 'abc123',
    userId: 'user-1',
  });
});

test('publishClickUpdate never throws even if the underlying publish fails', async (t) => {
  t.mock.module(`${SRC}/config/redis.js`, {
    namedExports: {
      redisClient: { publish: async () => { throw new Error('redis down'); } },
    },
  });

  const { publishClickUpdate } = await import(`${SRC}/services/realtime.service.js?v=${Date.now()}c`);
  await assert.doesNotReject(() => publishClickUpdate({ shortCode: 'abc', userId: 'u1', clickCount: 1 }));
});

test('subscribeToClickUpdates returns null instead of throwing when the subscription fails', async (t) => {
  t.mock.module(`${SRC}/config/redis.js`, {
    namedExports: {
      redisClient: {
        duplicate: () => ({
          on: () => {},
          connect: async () => { throw new Error('provider does not support pub/sub'); },
        }),
      },
    },
  });

  const { subscribeToClickUpdates } = await import(`${SRC}/services/realtime.service.js?v=${Date.now()}d`);
  const result = await subscribeToClickUpdates(() => {});
  assert.equal(result, null);
});
