# URL Shortener — Frontend

React 19 + Vite + Material UI client for the URL shortener. See the
root-level `README.md` for full project documentation and architecture, and
[`../docs/API.md`](../docs/API.md) for the exact request/response shapes
and Socket.io events this client talks to.

## Local development (without Docker)

```bash
cp .env.example .env
npm install
npm run dev      # http://localhost:5173
```

Requires the backend API running separately (see `../backend/README.md`)
and `VITE_API_URL` set in `.env` to point at it.

Optional: `VITE_GOOGLE_CLIENT_ID` enables the "Sign in with Google" button
on the login/register pages (hidden if unset - password auth still works
either way). Must match the `GOOGLE_CLIENT_ID` set in the backend's `.env`.

**Vite only reads `.env` at startup** - if you add or change a variable
while `npm run dev` is already running, stop it and start it again, or the
change won't take effect.

## Build

```bash
npm run build    # outputs to dist/
npm run preview  # serve the production build locally
```
