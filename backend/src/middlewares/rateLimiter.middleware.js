import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisClient } from '../config/redis.js';
import { sendError } from '../utils/htmlError.js';

const storeFor = (prefix) =>
  new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix,
  });

// RedisStore's constructor synchronously fires off an unawaited SCRIPT LOAD
// call - if that runs before connectRedis() has resolved (which it will, if
// these are built at module-import time), the rejection is unhandled and
// crashes the process before the server even starts. Building each limiter
// lazily on first request - by which point server.js has already awaited
// connectRedis() - sidesteps the ordering problem entirely.
function lazyLimiter(buildLimiter) {
  let limiter = null;
  return (req, res, next) => {
    if (!limiter) limiter = buildLimiter();
    return limiter(req, res, next);
  };
}

// Apply AFTER optionalAuth/requireAuth so req.user is already set.
export const shortenLimiter = lazyLimiter(() => {
  const anonMax = Number(process.env.SHORTEN_RATE_LIMIT_ANON ?? 5);
  const authMax = Number(process.env.SHORTEN_RATE_LIMIT_AUTH ?? 30);
  return rateLimit({
    windowMs: 60 * 1000,
    max: (req) => (req.user ? authMax : anonMax),
    standardHeaders: true,
    validate: { creationStack: false }, // false positive: we intentionally defer creation past module-load, not per-request
    legacyHeaders: false,
    store: storeFor('rl-shorten:'),
    message: { error: 'Too many links created, slow down and try again in a minute.' },
  });
});

export const redirectLimiter = lazyLimiter(() =>
  rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.REDIRECT_RATE_LIMIT ?? 100),
    standardHeaders: true,
    validate: { creationStack: false }, // false positive: we intentionally defer creation past module-load, not per-request
    legacyHeaders: false,
    store: storeFor('rl-redirect:'),
    // Custom handler instead of a plain `message` - this is the one limiter
    // a real browser navigation can actually hit (a popular link getting
    // clicked a lot), so it gets the same HTML-for-browsers treatment as
    // the redirect controller's own error responses.
    handler: (req, res) => {
      sendError(req, res, 429, 'Too many requests', 'This link is receiving a lot of traffic right now - please try again in a minute.');
    },
  })
);

export const authLimiter = lazyLimiter(() =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.AUTH_RATE_LIMIT ?? 10),
    standardHeaders: true,
    validate: { creationStack: false }, // false positive: we intentionally defer creation past module-load, not per-request
    legacyHeaders: false,
    store: storeFor('rl-auth:'),
    message: { error: 'Too many attempts, try again later.' },
  })
);
