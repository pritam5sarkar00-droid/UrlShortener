import dotenv from 'dotenv';
import http from 'node:http';

import app from './app.js';
import { checkDbConnection } from './config/db.js';
import { connectRedis, ensureShortcodeShield } from './config/redis.js';
import { initPublisher } from './services/queue.service.js';
import { startClickConsumer, scheduleExpirySweep } from './services/workerTasks.service.js';
import { attachRealtimeServer } from './realtime/socket.js';

dotenv.config();

const PORT = process.env.PORT || 3000;

async function start() {
  await checkDbConnection();
  console.log('[postgres] connected');

  // Redis is a cache, not a source of truth - a connection failure here
  // should degrade to "every redirect hits Postgres", not take the API down.
  try {
    await connectRedis();
    console.log('[redis] connected');
    await ensureShortcodeShield();
  } catch (err) {
    console.error('[redis] failed to connect at startup, continuing without cache:', err.message);
  }

  // amqp-connection-manager reconnects in the background on its own, so
  // creating the channel wrapper here just surfaces connection state in the
  // startup log - it never blocks or fails app boot if RabbitMQ is down.
  initPublisher();

  // The real architecture runs the worker (click consumer + expiry cron) as
  // its own process - see worker.js and docker-compose.yml, which is what
  // local dev and the project demo both use. This flag exists ONLY for
  // free-tier cloud deployments (e.g. Render) that don't have a free slot
  // for a second always-on process: it folds the worker's tasks into this
  // same process instead of running a separate one. Off by default.
  if (process.env.RUN_WORKER_INLINE === 'true') {
    startClickConsumer();
    scheduleExpirySweep();
    console.log('[api] worker tasks running inline (RUN_WORKER_INLINE=true)');
  } else {
    console.warn(
      '\n' +
      '⚠️  [api] No worker is running inline (RUN_WORKER_INLINE is not "true").\n' +
      '    Clicks will queue in RabbitMQ but click counts and real-time updates\n' +
      '    will NOT work until a worker consumes them. Either:\n' +
      '      - run `npm run worker:dev` in a separate terminal, or\n' +
      '      - run `npm run dev:all` instead of `npm run dev` to start both, or\n' +
      '      - set RUN_WORKER_INLINE=true in .env for a single-process setup.\n'
    );
  }

  // Wrapping Express in an explicit http.Server (instead of app.listen())
  // is what lets Socket.io attach to the exact same server/port - no
  // separate port or process needed for real-time updates.
  const httpServer = http.createServer(app);

  try {
    await attachRealtimeServer(httpServer);
    console.log('[realtime] Socket.io attached');
  } catch (err) {
    console.error('[realtime] failed to attach, dashboard will work without live updates:', err.message);
  }

  httpServer.listen(PORT, () => {
    console.log(`[api] listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('[api] failed to start', err);
  process.exit(1);
});
