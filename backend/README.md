# URL Shortener — Backend

Express + Node.js API, worker, and real-time server. See the root-level
`README.md` for full project documentation, [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)
for the HLD and design patterns, and [`../docs/API.md`](../docs/API.md) for
the full endpoint reference.

## Local development (without Docker)

```bash
cp .env.example .env    # then fill in real values - see below
npm install
npm run dev:all         # runs the API and the worker together, labeled output
```

`npm run dev:all` is almost always what you want locally: the API and the
worker are two separate processes by design (see the root README's
architecture notes), and click counts silently stay at 0 if only the API is
running with no worker to consume the queue. A loud startup warning fires if
you do run the API alone without `RUN_WORKER_INLINE=true` set.

Other scripts:
```bash
npm run dev              # API only
npm run worker:dev       # worker only, in a separate terminal
npm test                 # unit tests, no infra needed
npm run test:integration # needs real Postgres/Redis/RabbitMQ running
npm run test:all         # both
```

## Required setup

1. Copy `.env.example` to `.env` and point `DATABASE_URL` / `REDIS_URL` /
   `RABBITMQ_URL` at your local instances (`localhost`, not the Docker
   service names `postgres`/`redis`/`rabbitmq` - those only resolve inside
   Docker's network).
2. Run the migrations against your database, in order:
   ```bash
   psql -h localhost -U shortener -d url_shortener -f db/migrations/001_init.sql
   psql -h localhost -U shortener -d url_shortener -f db/migrations/002_google_auth.sql
   psql -h localhost -U shortener -d url_shortener -f db/migrations/003_link_enrichment.sql
   psql -h localhost -U shortener -d url_shortener -f db/migrations/004_page_summary.sql
   ```
3. `JWT_SECRET` and `SNOWFLAKE_WORKER_ID` are required; everything else
   (Google login, Safe Browsing, Gemini summaries) is optional and degrades
   gracefully when unset - see the root README's Features table for exactly
   what each one enables.

## Load testing

```bash
npm run loadtest:seed -- 500
npm run loadtest:redirect
npm run loadtest:create
npm run loadtest:ratelimit
```

See the root README's Benchmarks section for what these measure and real
numbers from a previous run.
