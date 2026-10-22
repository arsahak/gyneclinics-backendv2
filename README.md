# Gyneclinics Backend

Express + TypeScript + MongoDB API server for Gyneclinics.

## Run locally

```bash
npm install
npm run dev
```

- API base: `http://localhost:<PORT>/api/v1`
- API docs: `http://localhost:<PORT>/api-docs`
- Health check: `http://localhost:<PORT>/api/v1/health`

## Deploy to Vercel

Set the Vercel project root to `backend`. The `api/index.ts` function serves the
Express app, and `vercel.json` rewrites requests to that function. Configure
`MONGO_URI` and `JWT_SECRET` in the Vercel project environment variables before
deploying.

## Environment

Required: `MONGO_URI`, `JWT_SECRET`.

Optional:

- `DB_NAME` — database name (default `gyneclinicsdb`)
- `CLIENT_URL` or `CORS_ORIGIN` — allowed frontend origins, comma separated
- `DO_SPACES_*` — DigitalOcean Spaces settings for file uploads
