import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { io as ioClient } from 'socket.io-client';

import { attachRealtimeServer, closeRealtimeServer } from '../../src/realtime/socket.js';
import { publishClickUpdate, publishLinkDeleted, publishLinkPermanentlyDeleted } from '../../src/services/realtime.service.js';
import { connectRedis, redisClient } from '../../src/config/redis.js';
import { signToken } from '../../src/utils/jwt.js';

let httpServer;
let port;
let io;

before(async () => {
  await connectRedis();

  httpServer = http.createServer();
  io = await attachRealtimeServer(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

after(async () => {
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
  await closeRealtimeServer();
  await redisClient.quit();
});

function connect(token) {
  return ioClient(`http://localhost:${port}`, {
    auth: { token },
    reconnection: false,
    transports: ['websocket'],
  });
}

test('rejects a connection with no token', async () => {
  const socket = connect(undefined);
  const err = await new Promise((resolve) => socket.on('connect_error', resolve));
  assert.match(err.message, /Unauthorized/);
  socket.close();
});

test('rejects a connection with an invalid token', async () => {
  const socket = connect('not-a-real-token');
  const err = await new Promise((resolve) => socket.on('connect_error', resolve));
  assert.match(err.message, /Unauthorized/);
  socket.close();
});

test('an authenticated client receives a click update for its own link', async () => {
  const token = signToken({ id: 'user-alice', email: 'alice@example.com' });
  const socket = connect(token);
  await new Promise((resolve) => socket.on('connect', resolve));

  const received = new Promise((resolve) => socket.on('link:click', resolve));

  // Real Redis publish, exactly what clickEvent.service.js does after a
  // successful click - no mocking, this exercises the full real pipeline.
  await publishClickUpdate({ shortCode: 'alice-link', userId: 'user-alice', clickCount: 3 });

  const payload = await received;
  assert.deepEqual(payload, { shortCode: 'alice-link', clickCount: 3 });
  socket.close();
});

test('an authenticated client receives a "deleted" event for its own link', async () => {
  const token = signToken({ id: 'user-carol', email: 'carol@example.com' });
  const socket = connect(token);
  await new Promise((resolve) => socket.on('connect', resolve));

  const received = new Promise((resolve) => socket.on('link:deleted', resolve));

  await publishLinkDeleted({ shortCode: 'carol-link', userId: 'user-carol' });

  const payload = await received;
  assert.deepEqual(payload, { shortCode: 'carol-link' });
  socket.close();
});

test('an authenticated client receives a "permanentlyDeleted" event for its own link', async () => {
  const token = signToken({ id: 'user-dave', email: 'dave@example.com' });
  const socket = connect(token);
  await new Promise((resolve) => socket.on('connect', resolve));

  const received = new Promise((resolve) => socket.on('link:permanentlyDeleted', resolve));

  await publishLinkPermanentlyDeleted({ shortCode: 'dave-link', userId: 'user-dave' });

  const payload = await received;
  assert.deepEqual(payload, { shortCode: 'dave-link' });
  socket.close();
});

test('a user never receives another user\'s delete events either', async () => {
  const tokenCarol = signToken({ id: 'user-carol-2', email: 'carol2@example.com' });
  const tokenEve = signToken({ id: 'user-eve', email: 'eve@example.com' });

  const carolSocket = connect(tokenCarol);
  const eveSocket = connect(tokenEve);
  await Promise.all([
    new Promise((resolve) => carolSocket.on('connect', resolve)),
    new Promise((resolve) => eveSocket.on('connect', resolve)),
  ]);

  let eveReceivedSomething = false;
  eveSocket.on('link:deleted', () => { eveReceivedSomething = true; });

  const carolReceived = new Promise((resolve) => carolSocket.on('link:deleted', resolve));
  await publishLinkDeleted({ shortCode: 'carol-only-link', userId: 'user-carol-2' });
  await carolReceived;

  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(eveReceivedSomething, false, "eve must never receive carol's delete event");

  carolSocket.close();
  eveSocket.close();
});
test('a user never receives another user\'s click updates', async () => {
  const tokenAlice = signToken({ id: 'user-alice-2', email: 'alice2@example.com' });
  const tokenBob = signToken({ id: 'user-bob', email: 'bob@example.com' });

  const aliceSocket = connect(tokenAlice);
  const bobSocket = connect(tokenBob);
  await Promise.all([
    new Promise((resolve) => aliceSocket.on('connect', resolve)),
    new Promise((resolve) => bobSocket.on('connect', resolve)),
  ]);

  let bobReceivedSomething = false;
  bobSocket.on('link:click', () => { bobReceivedSomething = true; });

  const aliceReceived = new Promise((resolve) => aliceSocket.on('link:click', resolve));

  await publishClickUpdate({ shortCode: 'alice-only-link', userId: 'user-alice-2', clickCount: 1 });
  await aliceReceived;

  // Give any (incorrect) cross-delivery a moment to arrive before asserting
  // it didn't happen - room delivery is effectively synchronous locally,
  // but this avoids a flaky false-pass on a slower machine.
  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.equal(bobReceivedSomething, false, "bob must never receive alice's click update");

  aliceSocket.close();
  bobSocket.close();
});
