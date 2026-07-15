import { test } from 'node:test';
import assert from 'node:assert/strict';

const SRC = '../../src';

test('handleClickEvent inserts the click row and increments click_count', async (t) => {
  const queries = [];

  t.mock.module(`${SRC}/config/db.js`, {
    namedExports: {
      pool: {
        query: async (sql, params) => {
          queries.push({ sql, params });
          return { rows: [] };
        },
      },
      checkDbConnection: async () => {},
    },
  });

  const { handleClickEvent } = await import(`${SRC}/services/clickEvent.service.js?v=${Date.now()}`);

  await handleClickEvent({
    shortCode: 'abc123',
    ipHash: 'deadbeef',
    userAgent: 'TestAgent/1.0',
    referrer: 'https://google.com',
    clickedAt: '2026-01-01T00:00:00.000Z',
  });

  assert.equal(queries.length, 2, 'should run an INSERT and an UPDATE');
  assert.match(queries[0].sql, /INSERT INTO click_events/);
  assert.match(queries[1].sql, /UPDATE urls SET click_count/);
  assert.equal(queries[0].params[1], 'abc123');
  assert.equal(queries[0].params[2], 'deadbeef');
  assert.equal(queries[1].params[0], 'abc123');
});

test('handleClickEvent publishes a real-time update using the RETURNING values', async (t) => {
  let publishedPayload = null;

  t.mock.module(`${SRC}/config/db.js`, {
    namedExports: {
      pool: {
        query: async (sql) => {
          if (/INSERT/.test(sql)) return { rows: [] };
          if (/UPDATE urls/.test(sql)) return { rows: [{ user_id: 'user-abc', click_count: 7 }] };
          return { rows: [] };
        },
      },
      checkDbConnection: async () => {},
    },
  });
  t.mock.module(`${SRC}/services/realtime.service.js`, {
    namedExports: {
      publishClickUpdate: async (payload) => { publishedPayload = payload; },
    },
  });

  const { handleClickEvent } = await import(`${SRC}/services/clickEvent.service.js?v=${Date.now()}c`);
  await handleClickEvent({ shortCode: 'abc123' });

  assert.deepEqual(publishedPayload, { shortCode: 'abc123', userId: 'user-abc', clickCount: 7 });
});

test('handleClickEvent does not throw if the UPDATE matches no row', async (t) => {
  t.mock.module(`${SRC}/config/db.js`, {
    namedExports: {
      pool: { query: async () => ({ rows: [] }) },
      checkDbConnection: async () => {},
    },
  });

  const { handleClickEvent } = await import(`${SRC}/services/clickEvent.service.js?v=${Date.now()}d`);
  await assert.doesNotReject(() => handleClickEvent({ shortCode: 'nonexistent' }));
});
test('handleClickEvent tolerates missing optional fields', async (t) => {
  let insertParams = null;

  t.mock.module(`${SRC}/config/db.js`, {
    namedExports: {
      pool: {
        query: async (sql, params) => {
          if (/INSERT/.test(sql)) insertParams = params;
          return { rows: [] };
        },
      },
      checkDbConnection: async () => {},
    },
  });

  const { handleClickEvent } = await import(`${SRC}/services/clickEvent.service.js?v=${Date.now()}b`);

  await assert.doesNotReject(() => handleClickEvent({ shortCode: 'xyz789' }));
  assert.equal(insertParams[2], null); // ipHash
  assert.equal(insertParams[3], null); // userAgent
  assert.equal(insertParams[4], null); // referrer
});
