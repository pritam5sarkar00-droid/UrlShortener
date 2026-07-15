const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Every value interpolated into the HTML page below is escaped, even though
// today's call sites all pass static strings - err.message flows through
// errorHandler.middleware.js, and nothing should rely on every future
// throw() in this codebase happening to avoid special characters.
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * True when the request looks like a real browser navigating directly to a
 * URL (someone clicked a link, typed an address, etc), as opposed to a
 * fetch()/axios/curl API call. Browsers always send an Accept header that
 * explicitly includes "text/html" for top-level navigation; API clients
 * either omit Accept entirely or set it to application/json. Checking for
 * the literal substring is deliberately simpler than full quality-value
 * negotiation (req.accepts()) - it matches the one real signal that matters
 * here without being sensitive to header-ordering edge cases.
 */
export function wantsHtml(req) {
  return (req.headers.accept || '').includes('text/html');
}

function page(title, message, statusCode) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${safeTitle}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f5f6fa;
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #1a1a1a;
    padding: 24px;
  }
  .card {
    max-width: 420px;
    text-align: center;
    background: #fff;
    border-radius: 16px;
    padding: 40px 32px;
    box-shadow: 0 2px 24px rgba(0,0,0,0.08);
  }
  .code { color: #3457d5; font-weight: 700; font-size: 13px; letter-spacing: 0.5px; }
  h1 { font-size: 22px; margin: 12px 0 8px; }
  p { color: #666; line-height: 1.5; margin: 0 0 24px; }
  a.button {
    display: inline-block;
    background: #3457d5;
    color: #fff;
    text-decoration: none;
    padding: 10px 24px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="code">${statusCode}</div>
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    <a class="button" href="${FRONTEND_URL}">Shorten a link</a>
  </div>
</body>
</html>`;
}

/**
 * Sends either the branded HTML page or a plain JSON body depending on
 * wantsHtml(req) - use this instead of res.json() for any error response on
 * a route real browsers navigate to directly (the redirect endpoint, and
 * the catch-all 404/error handlers).
 */
export function sendError(req, res, statusCode, title, message) {
  if (wantsHtml(req)) {
    res.status(statusCode).type('html').send(page(title, message, statusCode));
  } else {
    res.status(statusCode).json({ error: message });
  }
}
