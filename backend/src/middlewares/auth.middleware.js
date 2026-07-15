import { verifyToken } from '../utils/jwt.js';

function extractUser(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const payload = verifyToken(header.slice(7));
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const user = extractUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = user;
  next();
}

export function optionalAuth(req, res, next) {
  req.user = extractUser(req);
  next();
}
