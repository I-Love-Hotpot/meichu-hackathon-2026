# CloudPhone Fastify Backend

This backend is a lightweight Fastify service designed to work with a CloudMosa CloudPhone widget web app.

## Quick start

1. Copy `.env.example` to `.env`.
2. Update the CloudPhone settings.
3. Install dependencies:

```bash
npm install
```

4. Run in development mode:

```bash
npm run dev
```

5. Start the production server:

```bash
npm start
```

## Main routes

- `GET /health`
- `GET /api/cloudphone/config`
- `POST /api/cloudphone/widget/launch`

## Environment variables

- `PORT`: server port, default `3001`
- `CLOUDPHONE_BASE_URL`: base URL of the CloudPhone service
- `CLOUDPHONE_WIDGET_URL`: widget frontend URL
- `CLOUDPHONE_API_KEY`: optional auth token for CloudPhone API
- `ALLOWED_ORIGINS`: allowed CORS origins, comma separated
