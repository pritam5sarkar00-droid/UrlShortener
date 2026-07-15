import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicHostname } from '../../src/utils/ssrfGuard.js';

test('rejects literal localhost', async () => {
  await assert.rejects(() => assertPublicHostname('http://localhost:5432/'));
});

test('rejects a literal loopback IP', async () => {
  await assert.rejects(() => assertPublicHostname('http://127.0.0.1/'));
});

test('rejects a literal private-range IP (10.x)', async () => {
  await assert.rejects(() => assertPublicHostname('http://10.0.0.5/'));
});

test('rejects a literal private-range IP (192.168.x)', async () => {
  await assert.rejects(() => assertPublicHostname('http://192.168.1.1/'));
});

test('rejects the cloud metadata address (169.254.169.254)', async () => {
  await assert.rejects(() => assertPublicHostname('http://169.254.169.254/latest/meta-data'));
});

test('rejects IPv6 loopback', async () => {
  await assert.rejects(() => assertPublicHostname('http://[::1]/'));
});

test('allows a literal public IP', async () => {
  await assert.doesNotReject(() => assertPublicHostname('http://8.8.8.8/'));
});

test('rejects a hostname that resolves to a private address', async (t) => {
  t.mock.module('node:dns/promises', {
    namedExports: {
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    },
  });

  const { assertPublicHostname: guarded } = await import(
    `../../src/utils/ssrfGuard.js?v=${Date.now()}`
  );
  await assert.rejects(() => guarded('http://internal-service.example.com/'));
});

test('allows a hostname that resolves to a public address', async (t) => {
  t.mock.module('node:dns/promises', {
    namedExports: {
      lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    },
  });

  const { assertPublicHostname: guarded } = await import(
    `../../src/utils/ssrfGuard.js?v=${Date.now()}b`
  );
  await assert.doesNotReject(() => guarded('http://example.com/'));
});
