"""CLI and Python API for colour-and-shape-only Top-3 pill inference."""

import argparse
import json
import os
import sys
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parent
ULTRALYTICS_CONFIG_DIR = PACKAGE_ROOT / ".ultralytics"
ULTRALYTICS_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("YOLO_CONFIG_DIR", str(ULTRALYTICS_CONFIG_DIR))

from src.errors import DatabaseLoadError, InferenceError, InputImageError, ModelLoadError
from src.pipeline import PillInferencePipeline


DEFAULT_CONFIG = PACKAGE_ROOT / "config.yaml"
_pipelines = {}


def get_pipeline(config_path=DEFAULT_CONFIG, weights=None):
    key = (str(Path(config_path).resolve()), str(Path(weights).resolve()) if weights else None)
    if key not in _pipelines:
        _pipelines[key] = PillInferencePipeline(key[0], weights_override=weights)
    return _pipelines[key]


def predict(image_path, weights=None, config_path=DEFAULT_CONFIG):
    """Return detected appearance and up to three same-colour/shape drugs."""
    return get_pipeline(config_path=config_path, weights=weights).predict(image_path)


def _write_json(path, content):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as output_file:
        json.dump(content, output_file, ensure_ascii=False, indent=2)
        output_file.write("\n")


def _batch_predict(pipeline, image_dir, output_dir, limit=None):
    image_dir = Path(image_dir)
    files = [path for path in sorted(image_dir.rglob("*")) if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".heic", ".heif"}]
    if limit is not None:
        files = files[:limit]
    output_dir = Path(output_dir)
    written = []
    for image_path in files:
        try:
            result = pipeline.predict(image_path)
        except Exception as error:
            result = {
                "input_image": str(image_path.resolve()),
                "status": "inference_error",
                "error": str(error),
                "detected_features": {},
                "predictions": [],
            }
        output_path = output_dir / image_path.stem / "prediction.json"
        _write_json(output_path, result)
        written.append(str(output_path))
    return written


def main(argv=None):
    parser = argparse.ArgumentParser(description="Top-3 pill inference using colour and shape only")
    parser.add_argument("--image", help="Input image path")
    parser.add_argument("--output", default="outputs/prediction.json", help="Candidate JSON output path")
    parser.add_argument("--weights", help="Compatible YOLO detection weights override")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="Package config path")
    parser.add_argument("--batch-dir", help="Optional image directory for per-image JSON inference")
    parser.add_argument("--batch-output-dir", default="outputs/batch", help="Directory containing <image-name>/prediction.json results")
    parser.add_argument("--batch-limit", type=int, help="Optional maximum number of batch images")
    args = parser.parse_args(argv)
    if not args.image and not args.batch_dir:
        parser.error("one of --image or --batch-dir is required")
    try:
        pipeline = get_pipeline(args.config, args.weights)
        if args.image:
            result = pipeline.predict(args.image)
            _write_json(args.output, result)
            print(json.dumps(result, ensure_ascii=False))
        if args.batch_dir:
            written = _batch_predict(pipeline, args.batch_dir, args.batch_output_dir, args.batch_limit)
            print(json.dumps({"written": written}, ensure_ascii=False))
        return 0
    except InputImageError as error:
        print(f"input image error: {error}", file=sys.stderr)
        return 2
    except ModelLoadError as error:
        print(f"model error: {error}", file=sys.stderr)
        return 3
    except DatabaseLoadError as error:
        print(f"database error: {error}", file=sys.stderr)
        return 4
    except InferenceError as error:
        print(f"inference error: {error}", file=sys.stderr)
        return 5


if __name__ == "__main__":
    raise SystemExit(main())
