import { test } from 'node:test';
import assert from 'node:assert/strict';

const SRC = '../../src';

test('scheduleExpirySweep broadcasts a real-time deleted event for each expired link', async (t) => {
  let capturedCallback = null;
  t.mock.module('node-cron', {
    defaultExport: { schedule: (_pattern, cb) => { capturedCallback = cb; } },
    namedExports: { schedule: (_pattern, cb) => { capturedCallback = cb; } },
  });

  const expiredRows = [
    { short_code: 'expired-1', user_id: 'user-a' },
    { short_code: 'expired-2', user_id: 'user-b' },
  ];

  t.mock.module(`${SRC}/config/db.js`, {
    namedExports: {
      pool: { query: async () => ({ rows: expiredRows }) },
      checkDbConnection: async () => {},
    },
  });
  t.mock.module(`${SRC}/config/redis.js`, {
    namedExports: { removeFromShortcodeShield: async () => {} },
  });
  t.mock.module(`${SRC}/services/cache.service.js`, {
    namedExports: { deleteCachedUrl: async () => {} },
  });

  const published = [];
  t.mock.module(`${SRC}/services/realtime.service.js`, {
    namedExports: {
      publishClickUpdate: async () => {},
      publishLinkDeleted: async (payload) => { published.push(payload); },
      publishLinkPermanentlyDeleted: async () => {},
      subscribeToClickUpdates: async () => null,
    },
  });
  // workerTasks.service.js also imports from here for the click-consumer
  // path (unused by these tests) - the REAL module opens an actual RabbitMQ
  // connection at import time, which would otherwise keep the test process
  // alive indefinitely (the same category of hang fixed once before, see
  // Phase 9's notes on app.js/config/rabbitmq.js).
  t.mock.module(`${SRC}/config/rabbitmq.js`, {
    namedExports: {
      CLICK_QUEUE: 'click-analytics',
      createChannelWrapper: () => ({}),
    },
  });

  const { scheduleExpirySweep } = await import(`${SRC}/services/workerTasks.service.js?v=${Date.now()}`);
  scheduleExpirySweep();

  assert.ok(capturedCallback, 'cron.schedule must have been called with a callback');
  await capturedCallback();

  // Give the fire-and-forget publish calls a tick to run.
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(published.length, 2, 'must broadcast a deleted event for every link the sweep deactivated');
  assert.deepEqual(published[0], { shortCode: 'expired-1', userId: 'user-a' });
  assert.deepEqual(published[1], { shortCode: 'expired-2', userId: 'user-b' });
});

test('scheduleExpirySweep does not crash and broadcasts nothing when no links have expired', async (t) => {
  let capturedCallback = null;
  t.mock.module('node-cron', {
    namedExports: { schedule: (_pattern, cb) => { capturedCallback = cb; } },
  });

  t.mock.module(`${SRC}/config/db.js`, {
    namedExports: {
      pool: { query: async () => ({ rows: [] }) },
      checkDbConnection: async () => {},
    },
  });
  t.mock.module(`${SRC}/config/redis.js`, { namedExports: { removeFromShortcodeShield: async () => {} } });
  t.mock.module(`${SRC}/services/cache.service.js`, { namedExports: { deleteCachedUrl: async () => {} } });

  let publishCalled = false;
  t.mock.module(`${SRC}/services/realtime.service.js`, {
    namedExports: {
      publishClickUpdate: async () => {},
      publishLinkDeleted: async () => { publishCalled = true; },
      publishLinkPermanentlyDeleted: async () => {},
      subscribeToClickUpdates: async () => null,
    },
  });
  t.mock.module(`${SRC}/config/rabbitmq.js`, {
    namedExports: {
      CLICK_QUEUE: 'click-analytics',
      createChannelWrapper: () => ({}),
    },
  });

  const { scheduleExpirySweep } = await import(`${SRC}/services/workerTasks.service.js?v=${Date.now()}b`);
  scheduleExpirySweep();

  await assert.doesNotReject(() => capturedCallback());
  assert.equal(publishCalled, false);
});
