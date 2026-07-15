import { test } from 'node:test';
import assert from 'node:assert/strict';

const SRC = '../../src';

function mockGoogleAuthLibrary(t, payload) {
  t.mock.module('google-auth-library', {
    namedExports: {
      OAuth2Client: class {
        async verifyIdToken() {
          if (payload === null) throw new Error('invalid token');
          return { getPayload: () => payload };
        }
      },
    },
  });
}

test('loginWithGoogle throws 500 if GOOGLE_CLIENT_ID is not configured', async (t) => {
  delete process.env.GOOGLE_CLIENT_ID;
  mockGoogleAuthLibrary(t, { sub: 'g1', email: 'a@example.com', email_verified: true });

  const { loginWithGoogle } = await import(`${SRC}/services/auth.service.js?v=${Date.now()}a`);
  await assert.rejects(() => loginWithGoogle('sometoken'), /not configured/);
});

test('loginWithGoogle rejects an invalid/unverifiable token', async (t) => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  mockGoogleAuthLibrary(t, null);

  const { loginWithGoogle } = await import(`${SRC}/services/auth.service.js?v=${Date.now()}b`);
  await assert.rejects(() => loginWithGoogle('badtoken'), /Invalid Google token/);
});

test('loginWithGoogle rejects an unverified email', async (t) => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  mockGoogleAuthLibrary(t, { sub: 'g1', email: 'a@example.com', email_verified: false });

  const { loginWithGoogle } = await import(`${SRC}/services/auth.service.js?v=${Date.now()}c`);
  await assert.rejects(() => loginWithGoogle('sometoken'), /unverified/);
});

test('loginWithGoogle creates a new account when no match exists', async (t) => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  mockGoogleAuthLibrary(t, { sub: 'g-new', email: 'new-user@example.com', email_verified: true });

  const queries = [];
  t.mock.module(`${SRC}/config/db.js`, {
    namedExports: {
      pool: {
        query: async (sql, params) => {
          queries.push({ sql, params });
          if (/SELECT.*google_id = \$1/.test(sql)) return { rows: [] };
          if (/SELECT.*email = \$1/.test(sql)) return { rows: [] };
          if (/INSERT INTO users/.test(sql)) {
            return { rows: [{ id: 'new-uuid', email: params[0], created_at: new Date() }] };
          }
          return { rows: [] };
        },
      },
      checkDbConnection: async () => {},
    },
  });

  const { loginWithGoogle } = await import(`${SRC}/services/auth.service.js?v=${Date.now()}d`);
  const result = await loginWithGoogle('sometoken');

  assert.equal(result.user.email, 'new-user@example.com');
  assert.ok(result.token);
  assert.ok(queries.some((q) => /INSERT INTO users/.test(q.sql)));
});

test('loginWithGoogle links google_id to an existing password-based account with the same email', async (t) => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  mockGoogleAuthLibrary(t, { sub: 'g-link', email: 'existing@example.com', email_verified: true });

  const queries = [];
  const existingUser = { id: 'existing-uuid', email: 'existing@example.com', created_at: new Date() };

  t.mock.module(`${SRC}/config/db.js`, {
    namedExports: {
      pool: {
        query: async (sql, params) => {
          queries.push({ sql, params });
          if (/SELECT.*google_id = \$1/.test(sql)) return { rows: [] }; // not yet linked
          if (/SELECT.*email = \$1/.test(sql)) return { rows: [existingUser] }; // found by email
          if (/UPDATE users SET google_id/.test(sql)) return { rows: [] };
          return { rows: [] };
        },
      },
      checkDbConnection: async () => {},
    },
  });

  const { loginWithGoogle } = await import(`${SRC}/services/auth.service.js?v=${Date.now()}e`);
  const result = await loginWithGoogle('sometoken');

  assert.equal(result.user.email, 'existing@example.com');
  assert.ok(
    queries.some((q) => /UPDATE users SET google_id/.test(q.sql)),
    'should link google_id to the existing account rather than creating a duplicate'
  );
});

test('loginWithGoogle returns the existing account directly when google_id already matches', async (t) => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  mockGoogleAuthLibrary(t, { sub: 'g-repeat', email: 'repeat@example.com', email_verified: true });

  let insertCalled = false;
  const linkedUser = { id: 'linked-uuid', email: 'repeat@example.com', created_at: new Date() };

  t.mock.module(`${SRC}/config/db.js`, {
    namedExports: {
      pool: {
        query: async (sql) => {
          if (/SELECT.*google_id = \$1/.test(sql)) return { rows: [linkedUser] };
          if (/INSERT INTO users/.test(sql)) insertCalled = true;
          return { rows: [] };
        },
      },
      checkDbConnection: async () => {},
    },
  });

  const { loginWithGoogle } = await import(`${SRC}/services/auth.service.js?v=${Date.now()}f`);
  const result = await loginWithGoogle('sometoken');

  assert.equal(result.user.email, 'repeat@example.com');
  assert.equal(insertCalled, false, 'a repeat login must not create a duplicate account');
});
