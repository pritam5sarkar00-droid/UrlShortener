# API reference

Base URL is wherever the API process is running (`http://localhost:3000` in
local dev). All request/response bodies are JSON unless noted. This is the
detailed version of the table in the root README - full request/response
shapes, every error case, and the Socket.io events, all verified directly
against the current controller/middleware code rather than summarized.

## Auth

Every route below except `/api/auth/*`, `GET /:code`, `/health`, and
`/metrics` requires a JWT. Send it as `Authorization: Bearer <token>`. A
token is issued by any of the three `/api/auth/*` endpoints and is a signed
JWT (`{ sub: userId, email }`, default 1h expiry via `JWT_EXPIRES_IN`).

`POST /api/shorten` uses **optional** auth: a valid token attaches `req.user`
(raising the rate limit and permitting a custom alias), but the endpoint
works without one too.

## Errors

Two shapes exist, chosen by content negotiation - see
[`ARCHITECTURE.md`](./ARCHITECTURE.md#content-negotiation-on-errors-utilshtmlerrorjs).

- **API clients** (no `text/html` in `Accept`): `{ "error": "message" }` -
  every error response in this document follows this shape unless noted.
- **Real browsers** (`Accept` includes `text/html`), only on routes a
  browser might navigate to directly (`GET /:code`, the 404 handler, the
  global error handler): a branded HTML page instead.

---

## `POST /api/auth/register`

Create a password account.

**Auth:** none · **Rate limit:** `authLimiter` (10 / 15 min per IP by default)

Request body:
```json
{ "email": "user@example.com", "password": "at least 8 characters" }
```
Validated with zod (`email` must parse as an email; `password` min length 8).

**`201`**
```json
{
  "user": { "id": "7123...", "email": "user@example.com", "createdAt": "2026-07-15T..." },
  "token": "eyJhbGciOi..."
}
```

Errors: `400` invalid body (zod message) · `409` `{ "error": "An account with that email already exists" }`

---

## `POST /api/auth/login`

**Auth:** none · **Rate limit:** `authLimiter`

Request body: `{ "email": "...", "password": "..." }` (`password` just
needs to be non-empty here - length is checked against the hash, not by
the schema).

**`200`** - same shape as register's `201`.

Errors: `400` invalid body · `401` `{ "error": "Invalid email or password" }` -
returned identically for a wrong password, an unknown email, **and** a
Google-only account with no password set. The message is deliberately
generic so it never reveals which of those three is actually true.

---

## `POST /api/auth/google`

Exchanges a Google Identity Services ID token for this app's own JWT. Does
not use `validate.middleware.js` - the token itself is the payload, not a
schema-checked body.

**Auth:** none · **Rate limit:** `authLimiter`

Request body: `{ "idToken": "..." }`

**`200`** - same `{ user, token }` shape as above. Matches an existing
account by `google_id` first, then by email (linking Google to an existing
password account), then creates a new password-less account if neither
matches.

Errors: `400` `{ "error": "idToken is required" }` · `401` invalid/unverified
token or unverified email on the Google account · `500` if
`GOOGLE_CLIENT_ID` isn't configured server-side (a deployment gap, not a
client error).

---

## `POST /api/shorten`

**Auth:** optional · **Rate limit:** `shortenLimiter` - 5/min anonymous,
30/min authenticated by default (`SHORTEN_RATE_LIMIT_ANON`/`_AUTH`)

Request body:
```json
{
  "longUrl": "https://example.com/some/page",
  "customAlias": "my-alias",
  "expiresInDays": 30
}
```
- `longUrl` - required, must be a syntactically valid `http:`/`https:` URL.
- `customAlias` - optional, **requires a token** (`403` without one). 3-20
  chars, letters/numbers/`_`/`-` only, and can't be a reserved word (`api`,
  `health`, `admin`, etc.).
- `expiresInDays` - optional integer, 1-3650. Defaults to 365.

Runs through Safe Browsing before creation - see the errors below.

**`201`**
```json
{
  "shortCode": "aZ3x9Q",
  "shortUrl": "http://localhost:3000/aZ3x9Q",
  "longUrl": "https://example.com/some/page",
  "expiresAt": "2027-07-15T...",
  "createdAt": "2026-07-15T..."
}
```
Title/category/summary are **not** in this response - they don't exist yet.
They arrive later via `GET /api/links` or the `link:enriched` socket event;
see [`ARCHITECTURE.md`](./ARCHITECTURE.md#creating-a-link-post-apishorten).

Errors: `400` invalid `longUrl`/`customAlias`/`expiresInDays`, or
`{ "error": "...flagged as unsafe...", "threatTypes": [...] }` if Safe
Browsing blocks it · `403` `{ "error": "Custom aliases require an account..." }`
if `customAlias` is set with no token · `409` `{ "error": "That custom alias is already taken" }`
· `429` rate limited.

---

## `GET /api/links`

The caller's own links, most recent first, including inactive (soft-deleted)
ones.

**Auth:** required

**`200`**
```json
{
  "links": [
    {
      "shortCode": "aZ3x9Q",
      "longUrl": "https://example.com/some/page",
      "clickCount": 42,
      "isCustomAlias": false,
      "isActive": true,
      "isExpired": false,
      "expiresAt": "2027-07-15T...",
      "createdAt": "2026-07-15T...",
      "title": "Example Page Title",
      "category": "Education",
      "summary": "A short AI-generated summary, or null if Gemini isn't configured.",
      "keyTopics": ["topic one", "topic two"],
      "readingTimeMinutes": 4
    }
  ]
}
```

`category` is guaranteed to always be a real string, never `null` - see
[`ARCHITECTURE.md`](./ARCHITECTURE.md#negative-cache--shielding-configredisjs)
and the categorization note in `pageMetadata.service.js`; worst case is
`"Other"`. `title`/`summary`/`keyTopics`/`readingTimeMinutes` are `null`
until background enrichment finishes (usually a few seconds after
creation) or if Gemini isn't configured (`summary`/`keyTopics` specifically).

---

## `DELETE /api/links/:code`

Soft delete (deactivate). Reversible in spirit - click history and the row
itself are kept, just flagged inactive - but there's no "undo" endpoint,
only the permanent-delete path below.

**Auth:** required (and scoped to the caller - the `WHERE` clause itself
enforces ownership, not a separate check)

**`204`** empty body.

Errors: `404` `{ "error": "Link not found" }` - returned identically
whether the code doesn't exist, belongs to someone else, or is already
inactive, so this endpoint never leaks which of those is true.

---

## `DELETE /api/links/:code/permanent`

Hard delete. Only works on a link that's **already** inactive - this is
enforced in the SQL `WHERE` clause (`is_active = false`), not just checked
in application code, so it's structurally impossible to skip the soft-delete
step even by calling this directly.

**Auth:** required

**`204`** empty body.

Errors: `404` `{ "error": "Link not found, not owned by you, or not yet deleted - delete it first before removing it permanently" }`

---

## `GET /:code`

The actual redirect. Not under `/api` - this is intentionally a top-level
catch-all, matched only after every `/api/...` route fails to match first.

**Auth:** none · **Rate limit:** `redirectLimiter` (100/min per IP by default,
`REDIRECT_RATE_LIMIT`)

**`302`** to the stored long URL on success, publishing a click event to
RabbitMQ (unawaited - never adds latency here).

**`404`** if the code doesn't exist or is inactive, **`404`** (message
"Link expired") if past `expiresAt` - both content-negotiated (HTML for a
browser, JSON for an API client). **`429`** if rate-limited, also
content-negotiated, since this is the one limiter a real browser click can
actually hit.

---

## `GET /health`

Liveness check, no auth, not rate-limited.

**`200`** `{ "status": "ok", "service": "api", "time": "2026-07-15T..." }`

## `GET /metrics`

Prometheus exposition format (`text/plain`), no auth, not rate-limited -
in a real deployment this is locked down at the network level rather than
the application level. Includes (among others) `cache_hits_total`,
`cache_misses_total`, `shortcode_shield_hits_total`,
`snowflake_ids_generated_total`, `page_enrichment_total{result="..."}`,
`safe_browsing_checks_total{result="..."}`, `click_events_processed_total`,
`click_events_failed_total`, `expiry_sweep_deactivated_total`.

---

## Socket.io (same port as the API)

Connect with `auth: { token: "<jwt>" }` in the handshake - there's no
anonymous mode, since an unauthenticated connection has no dashboard to
push updates to. An invalid/missing token rejects the connection with
`Unauthorized` before it completes. On success, the socket is joined to
room `user:<userId>` and only ever receives events for that user's own
links.

| Event | Payload | Fired when |
|---|---|---|
| `link:click` | `{ shortCode, clickCount }` | The worker finishes processing a click event for one of your links |
| `link:deleted` | `{ shortCode }` | You (or the expiry cron) soft-deletes one of your links, from any tab/device |
| `link:permanentlyDeleted` | `{ shortCode }` | You hard-delete one of your links |
| `link:enriched` | `{ shortCode, title, category, summary, keyTopics, readingTimeMinutes }` | Background page enrichment finishes for a link you just created - see [`ARCHITECTURE.md`](./ARCHITECTURE.md#creating-a-link-post-apishorten) |

Real-time is explicitly a nice-to-have layered on top of the REST API, not
a dependency of it: if the socket can't connect (an unsupported provider,
a network hiccup), every endpoint above still works exactly the same over
plain REST, just without the live push - a manual reload of `GET
/api/links` always reflects current state regardless of socket status.

## Rate limits at a glance

| Limiter | Window | Default limit | Backing store |
|---|---|---|---|
| `authLimiter` | 15 min | 10 / IP | Redis (`rate-limit-redis`) |
| `shortenLimiter` | 1 min | 5 / IP anon, 30 / user authenticated | Redis |
| `redirectLimiter` | 1 min | 100 / IP | Redis |

All three are distributed via Redis rather than in-process memory, so the
limit holds correctly across multiple API replicas, not just within one.
