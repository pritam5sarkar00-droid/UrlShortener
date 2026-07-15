import dotenv from 'dotenv';
import http from 'node:http';

import { checkDbConnection } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { startClickConsumer, scheduleExpirySweep } from './services/workerTasks.service.js';
import { register } from './config/metrics.js';

dotenv.config();

// The worker isn't an HTTP server otherwise, so it gets its own tiny one
// just for Prometheus to scrape - same /metrics contract as the api service.
// Not needed when these tasks run inline inside server.js (see RUN_WORKER_INLINE
// in server.js) - that process already serves /metrics via the Express app.
function startMetricsServer() {
  const port = process.env.METRICS_PORT || 9100;
  http
    .createServer(async (req, res) => {
      if (req.url === '/metrics') {
        res.setHeader('Content-Type', register.contentType);
        res.end(await register.metrics());
        return;
      }
      res.writeHead(404).end();
    })
    .listen(port, () => console.log(`[worker] metrics server listening on port ${port}`));
}

async function start() {
  await checkDbConnection();
  console.log('[postgres] connected');

  await connectRedis();
  console.log('[redis] connected');

  startClickConsumer();
  scheduleExpirySweep();
  startMetricsServer();
  console.log('[worker] ready');
}

start().catch((err) => {
  console.error('[worker] failed to start', err);
  process.exit(1);
});
