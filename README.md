# URL Shortener

A production-style URL shortener demonstrating real distributed-systems
patterns end to end: Snowflake ID generation, Base62 encoding, Redis
cache-aside/write-through caching, a Set-based negative cache for exact
database shielding (works on any Redis, including managed providers like
Upstash), RabbitMQ-based async click analytics with a dead-letter queue,
live real-time updates over Socket.io, full observability, and a set of
free/low-cost AI + security features layered on top (page summaries,
auto-categorization, phishing detection, branded QR codes).

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the high-level
design, every pattern above explained with where it lives in the code, and
step-by-step data flow walkthroughs. See [`docs/API.md`](./docs/API.md) for
the full request/response reference, including the Socket.io events.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, Material UI, custom "Signal & Ink" design system (light/dark mode) |
| Backend | Express, Node.js |
| Security | helmet, JWT, bcrypt, Google OAuth login, Google Safe Browsing |
| Database | PostgreSQL (plain `pg` - no ORM) |
| Caching | Redis - cache-aside + a Set-based shortcode shield (`SADD`/`SREM`/`SISMEMBER`, no special modules required) |
| Messaging | RabbitMQ (`amqp-connection-manager` / `amqplib`) |
| Real-time | Socket.io + Redis pub/sub - live click counts and cross-tab delete sync |
| Monitoring | Prometheus, Grafana |
| AI | Google Gemini (free tier) - page summaries + key topics |
| Containerization | Docker, Docker Compose |
| Testing | Node's built-in test runner, Supertest, `socket.io-client` for real WebSocket tests |

## Project structure

```
url-shortener/
├── docker-compose.yml
├── docs/
│   ├── ARCHITECTURE.md    # HLD diagram, design patterns, data flow walkthroughs
│   ├── API.md             # full request/response reference, Socket.io events
│   └── DEPLOYMENT.md      # step-by-step free-tier deployment walkthrough
├── backend/
│   ├── src/
│   │   ├── config/        # db, redis, rabbitmq, metrics
│   │   ├── controllers/   # url, links, auth, redirect
│   │   ├── middlewares/   # auth, validate, rateLimiter, safeBrowsing, errorHandler, metrics
│   │   ├── routes/
│   │   ├── services/      # url, auth, cache, queue, clickEvent, realtime, workerTasks,
│   │   │                  #   pageMetadata, pageSummary, safeBrowsing
│   │   ├── realtime/      # Socket.io server
│   │   ├── utils/         # snowflake, base62, jwt, hash, validators, ssrfGuard, htmlError
│   │   ├── app.js         # Express app (importable without binding a port - used by tests)
│   │   ├── server.js      # API entrypoint
│   │   └── worker.js      # standalone worker entrypoint (click consumer + expiry cron)
│   ├── db/migrations/     # plain .sql files, applied in order
│   ├── tests/{unit,integration}/
│   └── scripts/loadtest/
├── frontend/
│   └── src/
│       ├── api/           # fetch wrapper
│       ├── components/    # CreateLinkForm, LinksTable, QrCodeDialog, ClicksChart, etc.
│       ├── context/       # AuthContext
│       ├── hooks/         # useRealtimeClicks
│       └── pages/         # Home, Login, Register, Dashboard
└── monitoring/            # Prometheus scrape config + Grafana dashboard provisioning
```

## Getting started (Docker, local)

```bash
cp .env.example .env
docker-compose up --build
```

Once the containers are healthy:

- API health check: http://localhost:3000/health
- Frontend: http://localhost:5173
- RabbitMQ management UI: http://localhost:15672 (user/pass from `.env`)
- RedisInsight: http://localhost:8001
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (`admin`/`admin`)

Postgres runs `001_init.sql` automatically the first time the `postgres_data`
volume is created. Migrations 002-004 do **not** auto-run - apply them by
hand once, the same way, against any fresh database:

```bash
psql -h localhost -U shortener -d url_shortener -f backend/db/migrations/002_google_auth.sql
psql -h localhost -U shortener -d url_shortener -f backend/db/migrations/003_link_enrichment.sql
psql -h localhost -U shortener -d url_shortener -f backend/db/migrations/004_page_summary.sql
```

## Running the backend/frontend directly (no Docker)

Each of `backend/` and `frontend/` has its own `.env.example` with
`localhost` hostnames (Docker's service-name resolution like
`postgres`/`redis` only works *inside* Docker's network):

```bash
cd backend && cp .env.example .env && npm install && npm run dev:all   # api + worker together
cd frontend && cp .env.example .env && npm install && npm run dev
```

Two things that catch people out here:
- **Click counts need a worker running.** `npm run dev:all` runs both the
  API and the worker together (labeled, color-coded output). If you only run
  `node src/server.js` alone, clicks get published to RabbitMQ but nothing
  ever consumes them - `click_count` will stay stuck at 0. A loud startup
  warning fires if this happens.
- **Vite only reads `.env` at startup** - restart the dev server after
  adding or changing any `VITE_*` variable.

## Environment variables

All of these live in the root `.env` (Docker) or `backend/.env` /
`frontend/.env` (running directly). Everything below the first three rows is
optional - the app degrades gracefully with each one missing, see Features.

| Variable | Where | Required? |
|---|---|---|
| `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL` | backend | Yes |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `SNOWFLAKE_WORKER_ID` | backend | Yes |
| `VITE_API_URL` | frontend | Yes |
| `DATABASE_SSL=true` | backend | Only for managed Postgres (Neon, RDS, etc.) |
| `RUN_WORKER_INLINE=true` | backend | Only for free-tier hosts with one process slot (see Deployment) |
| `SHORTEN_RATE_LIMIT_ANON/AUTH`, `REDIRECT_RATE_LIMIT`, `AUTH_RATE_LIMIT` | backend | Has sane defaults |
| `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID` | backend / frontend | No - enables Google login (same value, two files) |
| `GOOGLE_SAFE_BROWSING_API_KEY` | backend | No - enables phishing/malware blocking |
| `GEMINI_API_KEY` | backend | No - enables AI page summaries |
| `FRONTEND_URL` | backend | Used for CORS lock-down and the HTML error pages' "back to home" link |

## API reference

Full request/response bodies, every error case, and rate limits are in
[`docs/API.md`](./docs/API.md). Quick reference:

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/auth/register` | - | `{ email, password }` → `{ user, token }` |
| `POST` | `/api/auth/login` | - | same shape |
| `POST` | `/api/auth/google` | - | `{ idToken }` → `{ user, token }` |
| `POST` | `/api/shorten` | optional | `{ longUrl, customAlias?, expiresInDays? }`. Custom alias requires a token. Blocked with 400 if Safe Browsing flags the URL |
| `GET` | `/api/links` | required | caller's own links, including inactive ones, with title/category/summary/keyTopics/readingTimeMinutes once background enrichment completes |
| `DELETE` | `/api/links/:code` | required | soft delete (deactivate) |
| `DELETE` | `/api/links/:code/permanent` | required | hard delete - only allowed on an already-deactivated link, enforced at the query level |
| `GET` | `/:code` | - | 302 redirect, or a content-negotiated 404/410 (branded HTML for a real browser, JSON for an API client) |
| `GET` | `/health` | - | liveness check |
| `GET` | `/metrics` | - | Prometheus exposition format |
| Socket.io | `/` (same port as the API) | required (JWT in the handshake `auth`) | emits `link:click`, `link:deleted`, `link:permanentlyDeleted`, `link:enriched` to a room scoped to the connecting user |

## Features

| Feature | Requires | Behavior if not configured |
|---|---|---|
| Create + redirect, Snowflake IDs, Base62 codes | - | - |
| Redis cache-aside/write-through | - | falls back to Postgres on every read |
| Shortcode shield (Set-based DB shielding) | - | fails open (no shielding, still correct) |
| Async click analytics + DLQ + expiry cron | - | - |
| Auth (JWT/bcrypt) + rate limiting | - | - |
| Real-time click counts, delete sync, and live enrichment updates | - | falls back to a manual refresh |
| Prometheus + Grafana | - | - |
| Google login | `GOOGLE_CLIENT_ID` + `VITE_GOOGLE_CLIENT_ID` | button hidden, password auth still works |
| Real page titles + auto-categorization | - | title stays null; category still resolves from the domain alone (worst case `"Other"`) - never blank |
| Phishing/malware blocking | `GOOGLE_SAFE_BROWSING_API_KEY` | check is skipped, all URLs allowed |
| QR codes with brand colors + self-drawn logo templates | - | fully client-side, always available |
| AI page summary + key topics | `GEMINI_API_KEY` | summary/topics stay null, reading time still computed (pure math) |
| Two-tier delete (soft, then permanent from the trash view) | - | - |
| Content-negotiated error pages | - | - |

## Architecture decisions

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full design -
HLD diagram, every pattern used and where, and data flow walkthroughs for
creating a link, redirecting, click analytics, and the expiry sweep. The
highlights:

- **IDs**: Snowflake (41-bit timestamp, 10-bit worker id, 12-bit sequence) -> Base62 encoded.
  Structurally collision-free across multiple API replicas, no central counter needed.
- **No ORM** - plain `pg` with hand-written parameterized SQL throughout. Full control
  over exact query shape (e.g. atomic `RETURNING` clauses used by the real-time
  broadcast), no hidden N+1s, migrations are just `.sql` files.
- **Custom aliases**: restricted to logged-in users (anonymous + vanity names is a
  common abuse vector). Checked against the shortcode shield, then Postgres, with the
  unique constraint on `short_code` as the final backstop against race conditions.
- **Anonymous shortening**: allowed for system-generated codes, with a stricter
  per-IP rate limit than authenticated users.
- **Expiry**: defaults to 1 year, overridable per link. Enforced independently on
  every redirect (not just by the daily cron), so an expired link 404s immediately
  rather than waiting up to 24 hours for the sweep to catch up.
- **DB shielding**: on a cache miss, the shortcode shield is checked before Postgres.
  No false negatives means a "definitely not here" result skips the database
  entirely. Fails open on any error - a broken shield only costs the optimization,
  never causes a false 404 on a real link.
- **Fault tolerance**: RabbitMQ messages that fail processing are dead-lettered
  instead of silently dropped.
- **Two-tier delete**: soft delete keeps click history and is reversible in spirit;
  permanent delete is only ever possible on an already-soft-deleted link, enforced
  by the SQL `WHERE` clause itself, not just a UI check.
- **Real-time updates**: Socket.io + Redis pub/sub. The pub/sub layer decouples
  "whoever processed the event" (a separate worker process, or the same process in
  free-tier inline mode) from "whoever's dashboard is open" - one consistent code
  path regardless of deployment topology. Every socket authenticates with the same
  JWT used for REST, joins a room scoped to that user, and never receives another
  user's events.
- **Google login**: Identity Services with server-side ID-token verification, not a
  redirect-based OAuth flow - no client secret in the browser. Matched by `google_id`
  first, then by email (linking an existing password account), or created new.
- **Phishing detection fails open**: an outage or missing API key never blocks link
  creation - a URL is only rejected when Safe Browsing actively confirms a match.
- **Page enrichment**: fire-and-forget after the create response is sent, guarded by
  an SSRF check before any fetch. One retry for transient failures only (timeouts,
  network errors) - never retried for a deterministic block (wrong content-type, a
  403, the SSRF guard), since those fail the same way every time. Every outcome is
  logged with a specific reason and tracked in a metric, not silently swallowed.
- **QR codes are fully client-side** with self-drawn logo templates (monogram,
  star, heart, dot) rendered on a local canvas - no external image URLs (which
  don't reliably fit) and no `canvas`/`sharp` backend dependency (a common source
  of Docker build failures, the same reasoning behind choosing `bcryptjs` over
  native `bcrypt`).
- **Content-negotiated error responses**: a real browser navigating directly to a
  dead/expired link gets a branded HTML page; API clients get plain JSON. Decided
  by the `Accept` header, not a query param or separate endpoint.
- **"Signal & Ink" design system**: a two-accent palette where warm amber is
  reserved exclusively for liveness/activity (the real-time Live badge, driven
  by the actual Socket.io connection status) and never used for anything else -
  the "expired" status chip deliberately uses a distinct muted ochre so it can
  never be confused with a live signal. Short codes and technical data render in
  JetBrains Mono, since they're literally code-like strings. Light/dark mode is
  a single `getTheme(mode)` factory so both palettes stay derived from the same
  tokens instead of drifting independently; the toggle persists to `localStorage`
  and defaults to the OS's `prefers-color-scheme` on first visit.

## Testing

```bash
cd backend
npm test                   # unit tests - fast, no infra needed
npm run test:integration   # needs docker-compose up (real Postgres/Redis/RabbitMQ)
npm run test:all           # both, 135 tests total (17 unit files, 3 integration files)
```

Unit tests are fully mocked (including real Socket.io + real Redis pub/sub for the
real-time layer, and a captured cron callback for the expiry sweep) and cover:
Snowflake generation, Base62 round-tripping, request validation, auth schemas,
Google OAuth logic, the shortcode-shield shielding branch, the SSRF guard, page
metadata extraction and its retry policy, the Safe Browsing fail-open policy,
Gemini summary parsing, the click handler, the real-time pub/sub bridge, the
expiry sweep's broadcast, and the HTML-escaping in error pages.

Integration tests run the real Express app against real Postgres/Redis/RabbitMQ:
full auth flow (including a Google-only account correctly getting a 401 rather
than crashing on password login), ownership rules, redirect behavior, the
two-tier delete lifecycle, and content-negotiated error responses.

## Benchmarks

Measured with `autocannon` (50 concurrent connections, 10s sustained) against
this exact codebase running in a single constrained container - Postgres,
Redis, and RabbitMQ all colocated. Directional numbers proving the design
holds up under load, not production capacity planning.

| Path | Requests/sec | p50 | p95 | p99 | Errors |
|---|---|---|---|---|---|
| Redirect (cache hit, 500 seeded links) | **2,425** | 15ms | 68ms | 86ms | 0 / 24,248 |
| Create (Snowflake + Base62 + Postgres write + cache write-through) | **789** | 55ms | 124ms | 161ms | 0 / 7,890 |

Rate limiter under real concurrent burst (50 simultaneous requests at the default
5/min anonymous limit): **exactly 5** succeeded, 45 got `429` - the distributed
Redis-backed limiter holds precisely under concurrency, not just sequential load.

Create being ~3x slower than redirect is expected: a create does a Postgres
`INSERT` plus a cache write, while a cache-hit redirect only does a Redis `GET`.

```bash
cd backend
npm run loadtest:seed -- 500
SHORTEN_RATE_LIMIT_ANON=1000000 REDIRECT_RATE_LIMIT=1000000 npm run dev &
npm run loadtest:redirect
npm run loadtest:create
npm run loadtest:ratelimit   # run against the *default* limits instead
```

## Deployment (free tier)

See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for the complete
step-by-step walkthrough (account setup, exact settings for each dashboard,
the `BASE_URL`/`FRONTEND_URL` wiring that's easy to miss, and a
troubleshooting section). Summary:
This project can run at $0/month: **Render** (backend, free Web Service),
**Vercel/Netlify** (frontend), **Neon** (Postgres), **Upstash** (Redis), and
**CloudAMQP** (RabbitMQ, free "Little Lemur" plan).

Two adaptations exist purely for this constraint, not because the local
architecture is wrong:
- **`DATABASE_SSL=true`** - managed Postgres requires TLS.
- **`RUN_WORKER_INLINE=true`** - Render's free tier gives one always-on
  process, not two. Folds the worker's click-consumer and expiry cron into
  the API process. Local dev and the project demo should still use the real
  two-process setup (`docker-compose.yml`, or `npm run dev:all`).
- The shortcode shield is a plain Redis Set (`SADD`/`SREM`/`SISMEMBER`),
  chosen specifically because it works on Upstash's standard command set -
  see [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md#negative-cache--shielding-configredisjs).
  The local `docker-compose.yml` Redis image (`redis-stack`) supports both
  this and the old Cuckoo-filter approach it replaced; Upstash only
  supports the former, which is exactly why the Set-based version is what
  ships here.

## Roadmap

**Core build (Phases 0-10)**: repo scaffold and Docker Compose · core CRUD ·
Snowflake ID + Base62 · Redis caching · shortcode shielding · RabbitMQ +
worker with DLQ · auth + rate limiting · Prometheus/Grafana · React frontend ·
test suite · load testing.

**Feature additions**: Google OAuth login · real page titles + auto-categorization
· phishing/malware detection (Safe Browsing) · QR codes with self-drawn logo
templates · AI page summaries (Gemini) · real-time click counts and cross-tab
delete sync (Socket.io + Redis pub/sub) · two-tier delete (soft, then
permanent) · content-negotiated HTML/JSON error responses.

**Hardening passes**: a full file-by-file audit across all backend and
frontend source files, which caught and fixed a real auth crash (a Google-only
account hitting an unhandled 500 on password login, since `bcrypt.compare`
throws rather than returning `false` against a null hash), a missing
real-time broadcast on the automatic expiry sweep, a shared-component state
leak in the QR dialog, an XSS defense-in-depth gap in the HTML error pages,
plus page-enrichment reliability (specific failure logging, a metric, and a
retry targeted at transient failures only).

**Reliability pass**: page enrichment (title/category/AI summary) now
reaches an open dashboard live via a `link:enriched` Socket.io event instead
of only appearing after a manual reload; the Cuckoo-filter shortcode shield
was rebuilt on a plain Redis Set after discovering it silently no-op'd
against Upstash's managed Redis (no RedisBloom module support), with the
Prometheus metric, Grafana panel, and test suite renamed to match; and
`category` is now guaranteed non-null end to end (hostname-based
categorization needs no successful fetch, and the API layer heals any
pre-existing `NULL` rows on read) instead of silently staying blank whenever
the target page's fetch failed.

**Visual redesign**: a custom light/dark theme system ("Signal & Ink") replacing
the default Material look - Space Grotesk + Inter + JetBrains Mono typography,
a two-accent palette where warm amber means liveness and nothing else, a
theme-aware click chart (recharts doesn't inherit MUI's theme automatically),
and a toggle that persists across visits.
