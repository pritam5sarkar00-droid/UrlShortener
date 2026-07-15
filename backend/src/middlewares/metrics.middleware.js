import { httpRequestDuration } from '../config/metrics.js';

export function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;

    // req.route.path is the matched pattern (e.g. "/:code"), not the literal
    // URL - using the literal path would create a new label series per short
    // code ever created, which is exactly the cardinality blowup Prometheus
    // documentation warns against.
    const route = req.route?.path
      ? (req.baseUrl || '') + req.route.path
      : req.path.startsWith('/api') ? req.path : '/:code';

    httpRequestDuration.observe(
      { method: req.method, route, status_code: res.statusCode },
      durationSeconds
    );
  });

  next();
}
