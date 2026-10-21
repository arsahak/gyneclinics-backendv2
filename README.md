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

## Environment

Required: `MONGO_URI`, `JWT_SECRET`.

Optional:

- `DB_NAME` — database name (default `gyneclinicsdb`)
- `CLIENT_URL` or `CORS_ORIGIN` — allowed frontend origins, comma separated
- `DO_SPACES_*` — DigitalOcean Spaces settings for file uploads
