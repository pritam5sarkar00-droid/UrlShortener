import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wantsHtml, sendError } from '../../src/utils/htmlError.js';

test('wantsHtml is true for a typical real browser Accept header', () => {
  const req = { headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8' } };
  assert.equal(wantsHtml(req), true);
});

test('wantsHtml is false when Accept is missing entirely (typical fetch/curl default)', () => {
  assert.equal(wantsHtml({ headers: {} }), false);
});

test('wantsHtml is false for an explicit JSON Accept header', () => {
  assert.equal(wantsHtml({ headers: { accept: 'application/json' } }), false);
});

test('wantsHtml is false for a bare */* Accept header', () => {
  assert.equal(wantsHtml({ headers: { accept: '*/*' } }), false);
});

function makeRes() {
  const res = { statusCode: null, contentType: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.type = (t) => { res.contentType = t; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  res.send = (payload) => { res.body = payload; return res; };
  return res;
}

test('sendError sends JSON with the exact message for a non-browser request', () => {
  const req = { headers: { accept: 'application/json' } };
  const res = makeRes();
  sendError(req, res, 404, 'Link not found', 'This short link does not exist.');

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'This short link does not exist.' });
});

test('sendError sends an HTML page containing the title and message for a browser request', () => {
  const req = { headers: { accept: 'text/html,application/xhtml+xml' } };
  const res = makeRes();
  sendError(req, res, 404, 'Link expired', 'This short link is no longer active.');

  assert.equal(res.statusCode, 404);
  assert.equal(res.contentType, 'html');
  assert.match(res.body, /Link expired/);
  assert.match(res.body, /This short link is no longer active\./);
  assert.match(res.body, /<!DOCTYPE html>/);
});

test('sendError never leaks JSON structure into the HTML branch', () => {
  const req = { headers: { accept: 'text/html' } };
  const res = makeRes();
  sendError(req, res, 500, 'Something went wrong', 'boom');
  assert.equal(typeof res.body, 'string');
  assert.doesNotMatch(res.body, /^\{/);
});

test('sendError HTML-escapes the message - a script tag in err.message must never execute', () => {
  const req = { headers: { accept: 'text/html' } };
  const res = makeRes();
  sendError(req, res, 500, 'Something went wrong', '<script>alert(1)</script>');

  assert.doesNotMatch(res.body, /<script>alert\(1\)<\/script>/, 'the raw script tag must never appear unescaped');
  assert.match(res.body, /&lt;script&gt;/, 'it must appear HTML-escaped instead');
});

test('sendError HTML-escapes the title too', () => {
  const req = { headers: { accept: 'text/html' } };
  const res = makeRes();
  sendError(req, res, 404, '"><img src=x onerror=alert(1)>', 'message');

  assert.doesNotMatch(res.body, /<img src=x onerror=alert\(1\)>/);
});
