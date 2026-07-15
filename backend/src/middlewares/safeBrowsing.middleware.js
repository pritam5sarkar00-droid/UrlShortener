import { checkUrlAgainstSafeBrowsing } from '../services/safeBrowsing.service.js';
import { safeBrowsingChecksTotal } from '../config/metrics.js';

/**
 * Runs after validateShortenRequest, so req.body.longUrl is already known to
 * be a syntactically valid http(s) URL by this point.
 *
 * Design decision: fails OPEN on any error checking the URL (network
 * failure, Safe Browsing outage, quota exceeded, timeout). This mirrors the
 * cache/shortcode-shield philosophy used everywhere else in this app - a
 * best-effort third-party dependency being briefly unavailable should never
 * take down the core "create a link" feature. A URL is only ever BLOCKED
 * when Safe Browsing actively confirms it's on a real threat list, never
 * because the check couldn't be completed.
 */
export async function checkUrlSafety(req, res, next) {
  try {
    const result = await checkUrlAgainstSafeBrowsing(req.body.longUrl);

    if (result.flagged) {
      safeBrowsingChecksTotal.inc({ result: 'flagged' });
      return res.status(400).json({
        error: 'This URL was flagged as unsafe by Google Safe Browsing and cannot be shortened.',
        threatTypes: result.threatTypes,
      });
    }

    safeBrowsingChecksTotal.inc({ result: result.checked ? 'clean' : 'skipped' });
    next();
  } catch (err) {
    console.error('[safe-browsing] check failed, allowing creation (fail-open):', err.message);
    safeBrowsingChecksTotal.inc({ result: 'error' });
    next();
  }
}
