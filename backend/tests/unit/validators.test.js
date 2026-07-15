import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerSchema, loginSchema } from '../../src/utils/validators.js';
import { validate } from '../../src/middlewares/validate.middleware.js';

test('registerSchema accepts a valid email + 8+ char password', () => {
  const result = registerSchema.safeParse({ email: 'a@example.com', password: 'hunter22' });
  assert.equal(result.success, true);
});

test('registerSchema rejects an invalid email', () => {
  const result = registerSchema.safeParse({ email: 'not-an-email', password: 'hunter22' });
  assert.equal(result.success, false);
});

test('registerSchema rejects a too-short password', () => {
  const result = registerSchema.safeParse({ email: 'a@example.com', password: 'short' });
  assert.equal(result.success, false);
});

test('loginSchema only requires a non-empty password (no length minimum)', () => {
  const result = loginSchema.safeParse({ email: 'a@example.com', password: 'x' });
  assert.equal(result.success, true);
});

test('validate() middleware: passes through valid input and strips unknown fields via parsed data', () => {
  const req = { body: { email: 'a@example.com', password: 'hunter22' } };
  let nextCalled = false;
  validate(registerSchema)(req, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('validate() middleware: rejects invalid input with 400 and a readable message', () => {
  const req = { body: { email: 'bad', password: 'hunter22' } };
  let statusCode = null;
  let payload = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(p) { payload = p; return this; },
  };
  let nextCalled = false;
  validate(registerSchema)(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 400);
  assert.ok(payload.error);
});
