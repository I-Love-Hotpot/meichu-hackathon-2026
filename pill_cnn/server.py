"""Internal HTTP API for the local pill inference pipeline."""

import json
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from inference import get_pipeline, predict
from src.errors import DatabaseLoadError, InferenceError, InputImageError, ModelLoadError


MAX_IMAGE_BYTES = 5 * 1024 * 1024
MEDIA_TYPES = {
    "image/jpeg": (".jpg", lambda value: value.startswith(b"\xff\xd8\xff")),
    "image/png": (".png", lambda value: value.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": (
        ".webp",
        lambda value: len(value) >= 12
        and value.startswith(b"RIFF")
        and value[8:12] == b"WEBP",
    ),
}
INFERENCE_LOCK = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    server_version = "PillInference/2.0"

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True})
            return
        self._json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/recognize":
            self._json(404, {"error": "Not found"})
            return

        media_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if media_type not in MEDIA_TYPES:
            self._json(415, {"error": "Use JPEG, PNG, or WebP."})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length < 1:
            self._json(400, {"error": "Provide a non-empty image."})
            return
        if content_length > MAX_IMAGE_BYTES:
            self._json(413, {"error": "Image must not exceed 5 MiB."})
            return

        image = self.rfile.read(content_length)
        suffix, matches_type = MEDIA_TYPES[media_type]
        if len(image) != content_length or not matches_type(image):
            self._json(400, {"error": "Image bytes do not match the declared format."})
            return

        try:
            with tempfile.TemporaryDirectory(prefix="pill-inference-") as directory:
                image_path = Path(directory) / f"image{suffix}"
                image_path.write_bytes(image)
                with INFERENCE_LOCK:
                    result = predict(image_path)
            self._json(200, result)
        except InputImageError as error:
            self._json(400, {"error": str(error)})
        except (ModelLoadError, DatabaseLoadError) as error:
            self._json(503, {"error": str(error)})
        except InferenceError as error:
            self._json(502, {"error": str(error)})
        except Exception:
            self._json(500, {"error": "Inference failed."})

    def log_message(self, format, *args):
        print(f"{self.address_string()} - {format % args}", flush=True)


def main():
    get_pipeline().warm_up()
    port = int(os.environ.get("PORT", "8000"))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
