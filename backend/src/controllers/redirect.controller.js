import { getUrlByCode } from '../services/url.service.js';
import { publishClickEvent, buildClickPayload } from '../services/queue.service.js';
import { sendError } from '../utils/htmlError.js';

export async function redirectToLongUrl(req, res, next) {
  try {
    const { code } = req.params;
    const url = await getUrlByCode(code);

    if (!url || !url.is_active) {
      return sendError(req, res, 404, 'Link not found', "This short link doesn't exist or has been removed.");
    }
    if (url.expires_at && new Date(url.expires_at) < new Date()) {
      return sendError(req, res, 404, 'Link expired', 'This short link is no longer active.');
    }

    // Fire-and-forget - the redirect response never waits on this. Worst
    // case a click goes unrecorded; that's an acceptable tradeoff for never
    // adding RabbitMQ latency to the user-facing redirect.
    publishClickEvent(buildClickPayload(req, code)).catch((err) =>
      console.error('[queue] failed to publish click event (non-fatal):', err.message)
    );

    res.redirect(302, url.long_url);
  } catch (err) {
    next(err);
  }
}
