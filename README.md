# meichu-hackathon-2026

The local pill model runs in a separate Compose project. Start it first so the
shared `medicine-inference-net` network exists, then start the application:

```bash
docker compose -f docker-compose.inference.yaml up --build -d
docker compose up --build -d
```

For production, start the same inference project before
`docker-compose.prod.yaml`. The backend reaches it internally at
`http://pill-inference:8000`; only `127.0.0.1:8000` is published on the host.
