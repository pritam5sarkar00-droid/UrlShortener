import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { register } from './config/metrics.js';
import { metricsMiddleware } from './middlewares/metrics.middleware.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.middleware.js';
import router from './routes/index.js';

dotenv.config();

const app = express();
app.use(metricsMiddleware); // first, so it wraps the full request lifecycle
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(morgan('dev'));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api', time: new Date().toISOString() });
});

// Scraped by Prometheus, not rate-limited and not behind auth - in a real
// deployment this is locked down at the network level (internal-only),
// not the application level.
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

// Create + redirect, backed by Postgres with a Redis cache-aside layer in
// front of the redirect path and a shortcode shield (Set-based negative
// cache) shielding it from lookups for codes that definitely don't exist.
// Click events publish to RabbitMQ asynchronously - the worker service
// consumes them.
app.use(router);

app.use(notFoundHandler);

app.use(errorHandler);

export default app;
