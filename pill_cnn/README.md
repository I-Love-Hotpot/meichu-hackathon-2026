# Pill CNN inference service

This package is the standalone Python/PyTorch service used by the Node backend.
YOLO detects and crops a pill, then a MobileNetV3 classifier returns the Top-3
classes. The service preserves the classifier's original six-digit numeric IDs;
the Node backend is responsible for loading the matching MariaDB rows.

## Runtime contract

`POST /recognize` accepts raw JPEG, PNG, or WebP bytes with the matching
`Content-Type`. The maximum image size is 5 MiB.

```json
{
  "pill_id": [
    "018251",
    "018172"
  ]
}
```

The response has exactly one field and at most three IDs. `GET /health`
returns `{ "ok": true }` after all models and the CSV have loaded successfully.
Inference is serialized inside the process to avoid concurrent access to the
model instances.

## Runtime files

```text
server.py
inference.py
config.yaml
requirements.txt
requirements.runtime.txt
src/
models/pill_detector.pt
models/cnn/pill_classifier.pt
database/42_2.csv
```

The Docker image uses `requirements.runtime.txt` and copies only runtime files.
`requirements.txt` remains the full local/development dependency list. `demo/`,
`training/`, `tests/`, OCR models, and alternate classifier checkpoints remain
development assets and are excluded by `.dockerignore`.

## Docker

Build and run from the repository root:

```bash
docker compose -f docker-compose.inference.yaml up --build -d
curl http://127.0.0.1:8000/health
```

The container installs CPU-only PyTorch and does not require a GPU. Native
runtime packages are pinned to versions whose Linux wheels work on baseline
x86-64 KVM CPUs; update NumPy, OpenCV, and Pandas together and verify the image
on the deployment host before changing those pins.

## Local CLI

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python inference.py --image path/to/pill.jpg --output outputs/prediction.json
```

CLI output uses the same contract as the HTTP service:

```json
{ "pill_id": ["018251"] }
```

Model confidence is not a verified medicine identity and must not be used as a
substitute for packaging, a pharmacist, or professional medical advice.
