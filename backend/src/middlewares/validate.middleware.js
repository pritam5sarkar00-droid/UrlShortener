// Generic validator for routes backed by a zod schema (currently just auth) -
// the URL-creation route keeps its own validateShortenRequest below since it
// needs the http(s)-only + reserved-alias checks that a plain zod .url()
// doesn't give you for free.
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0]?.message || 'Invalid request body' });
    }
    req.body = result.data;
    next();
  };
}

const RESERVED_ALIASES = new Set([
  'api', 'health', 'static', 'admin', 'auth', 'login', 'register', 'metrics', 'favicon.ico',
]);
const ALIAS_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;
const MAX_EXPIRY_DAYS = 3650;

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateShortenRequest(req, res, next) {
  const { longUrl, customAlias, expiresInDays } = req.body;

  if (!longUrl || typeof longUrl !== 'string' || !isValidHttpUrl(longUrl)) {
    return res.status(400).json({ error: 'longUrl must be a valid http(s) URL' });
  }

  if (customAlias !== undefined) {
    if (typeof customAlias !== 'string' || !ALIAS_REGEX.test(customAlias)) {
      return res.status(400).json({
        error: 'customAlias must be 3-20 characters: letters, numbers, "_" or "-"',
      });
    }
    if (RESERVED_ALIASES.has(customAlias.toLowerCase())) {
      return res.status(400).json({ error: 'That alias is reserved, pick another' });
    }
  }

  if (expiresInDays !== undefined) {
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > MAX_EXPIRY_DAYS) {
      return res.status(400).json({
        error: `expiresInDays must be an integer between 1 and ${MAX_EXPIRY_DAYS}`,
      });
    }
  }

  next();
}
