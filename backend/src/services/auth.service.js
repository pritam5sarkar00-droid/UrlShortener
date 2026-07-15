import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../config/db.js';
import { signToken } from '../utils/jwt.js';
import { AppError } from '../utils/appError.js';

const SALT_ROUNDS = 10;
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function toUserResponse(row) {
  return { id: row.id, email: row.email, createdAt: row.created_at };
}

export async function register({ email, password }) {
  email = email.trim().toLowerCase();

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw new AppError('An account with that email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  let rows;
  try {
    ({ rows } = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [email, passwordHash]
    ));
  } catch (err) {
    if (err.code === '23505') {
      // Lost a race with another request for the same email between the
      // check above and this insert - same outcome, just via the DB instead.
      throw new AppError('An account with that email already exists', 409);
    }
    throw err;
  }

  const user = toUserResponse(rows[0]);
  return { user, token: signToken(user) };
}

export async function login({ email, password }) {
  email = email.trim().toLowerCase();

  const { rows } = await pool.query(
    'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
    [email]
  );
  const row = rows[0];
  // A Google-only account has no password_hash (see migration
  // 002_google_auth.sql) - bcrypt.compare() throws on a null hash rather
  // than returning false, so this must be checked explicitly. Same generic
  // message as a wrong password, deliberately - this shouldn't reveal
  // whether the account exists or how it was created.
  if (!row || !row.password_hash) {
    throw new AppError('Invalid email or password', 401);
  }

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) {
    throw new AppError('Invalid email or password', 401);
  }

  const user = toUserResponse(row);
  return { user, token: signToken(user) };
}

export async function loginWithGoogle(idToken) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    // Fail loudly rather than silently accepting unverifiable tokens - this
    // is a deployment config gap, not a client error.
    throw new AppError('Google login is not configured on this server', 500);
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw new AppError('Invalid Google token', 401);
  }

  const googleId = payload.sub;
  const email = payload.email?.trim().toLowerCase();
  if (!email || !payload.email_verified) {
    throw new AppError('Google account email is missing or unverified', 401);
  }

  // 1. Already linked by google_id - the common case on repeat logins.
  let { rows } = await pool.query(
    'SELECT id, email, created_at FROM users WHERE google_id = $1',
    [googleId]
  );
  if (rows.length > 0) {
    const user = toUserResponse(rows[0]);
    return { user, token: signToken(user) };
  }

  // 2. An account with this email already exists (e.g. registered with a
  // password previously) - link the Google identity to it rather than
  // erroring or creating a duplicate account for the same person.
  ({ rows } = await pool.query('SELECT id, email, created_at FROM users WHERE email = $1', [email]));
  if (rows.length > 0) {
    await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, rows[0].id]);
    const user = toUserResponse(rows[0]);
    return { user, token: signToken(user) };
  }

  // 3. Brand new account, no password (password_hash is nullable for
  // Google-only accounts - see migration 002_google_auth.sql).
  try {
    ({ rows } = await pool.query(
      `INSERT INTO users (email, google_id) VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [email, googleId]
    ));
  } catch (err) {
    if (err.code === '23505') {
      throw new AppError('An account with that email already exists', 409);
    }
    throw err;
  }

  const user = toUserResponse(rows[0]);
  return { user, token: signToken(user) };
}
