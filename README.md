# meichu-hackathon-2026

## Server architecture

```text
Browser
  │
  ├─ frontend (Vite / Nginx)
  │      │
  │      ▼
  └─ backend (Fastify, port 3001)
         ├─ MariaDB: medicine records
         └─ chia.dstw.dev: hosted pill image recognition
                ├─ YOLO: pill detection/crop
                └─ MobileNetV3: Top-3 classification
```

The Node backend and PyTorch inference server are separate processes and
separate Docker images. PyTorch, Ultralytics, OpenCV, Python source, and `.pt`
files are never copied into the backend image.

## Server directories

```text
backend/
  src/routes/                 HTTP routes
  src/services/               business logic and external integrations
  api-docs/                   OpenAPI document
  resources/42_2.csv          backend catalog data
  test/                       Node tests
  Dockerfile                  production backend image
  Dockerfile.dev              development backend image

pill_cnn/
  server.py                   internal GET /health and POST /recognize API
  inference.py                CLI and reusable Python entry point
  src/                        YOLO + MobileNet inference pipeline
  models/                     model assets
  database/42_2.csv           classifier metadata used during inference
  Dockerfile                  standalone inference image
  .dockerignore               excludes training/demo/unused model assets
  demo/, training/, tests/    development assets; not included in the image

docker-compose.yaml           development frontend/backend/database
docker-compose.prod.yaml      production frontend/backend
docker-compose.db.prod.yaml   production database
docker-compose.inference.yaml standalone PyTorch inference service
```

## Medicine recognition flow

1. The client posts raw JPEG, PNG, or WebP bytes to
   `POST /api/medicine/recognize` (maximum 5 MiB).
2. `backend` forwards the bytes to `http://chia.dstw.dev/recognize`.
3. The hosted inference service returns only up to three six-digit numeric IDs:

   ```json
   { "pill_id": ["018251"] }
   ```

4. `backend` looks up every ID in MariaDB and returns the complete matching
   database rows as JSON in `medicines`. The normalized `records` field remains
   available for the current frontend UI.

## Start development services

```bash
cp .env.example .env
docker compose up --build -d
```

Service URLs:

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:3001`
- Swagger: `http://localhost:3001/api-docs`
- Adminer: `http://localhost:3002`
- Inference health check: `http://chia.dstw.dev/health`

Stop the application Compose project:

```bash
docker compose down
```

## Start production services

Create the externally managed `coolify` and `db-net` networks as required by
the deployment environment, then start the database and app projects:

```bash
docker compose -f docker-compose.db.prod.yaml up -d
docker compose -f docker-compose.prod.yaml up --build -d
```

See `backend/README.md` for the HTTP API and environment-variable contract.
test
