from pathlib import Path

import pandas as pd
import yaml

from .appearance import analyze_appearance
from .console import third_party_stdout_to_stderr
from .detector import PillDetector
from .errors import DatabaseLoadError, InferenceError, InputImageError, ModelLoadError
from .matcher import match_appearance_top_three, prepare_database


class PillInferencePipeline:
    def __init__(self, config_path, weights_override=None):
        self.config_path = Path(config_path).resolve()
        try:
            with self.config_path.open(encoding="utf-8") as config_file:
                self.config = yaml.safe_load(config_file) or {}
        except Exception as error:
            raise InferenceError(f"Could not read config: {error}") from error
        self.root = self.config_path.parent
        model_config = self.config["model"]
        weights = weights_override or model_config["detector_weights"]
        weights_path = self._resolve(weights)
        self.detector = PillDetector(
            weights_path, device=model_config.get("device", "cpu"), image_size=model_config.get("image_size", 640),
            confidence=model_config.get("confidence_threshold", 0.25),
            low_confidence=model_config.get("low_confidence_threshold", 0.10), iou=model_config.get("iou_threshold", 0.7),
        )
        self.top_k = self.config["matching"].get("top_k", 3)
        self.database_path = self._resolve(self.config["database"]["path"])
        self.database = None

    def _resolve(self, value):
        path = Path(value)
        return path if path.is_absolute() else self.root / path

    def _load_database(self):
        if self.database is not None:
            return
        if not self.database_path.is_file():
            raise DatabaseLoadError(f"Database file not found: {self.database_path}")
        try:
            if self.database_path.suffix.lower() == ".csv":
                source_database = pd.read_csv(self.database_path)
            else:
                source_database = pd.read_excel(self.database_path)
            self.database = prepare_database(source_database)
            required = {"用量排序", "批價碼", "學名", "顏色", "形狀"}
            missing = required - set(self.database.columns)
            if missing:
                raise DatabaseLoadError(f"Database is missing columns: {sorted(missing)}")
        except DatabaseLoadError:
            raise
        except Exception as error:
            raise DatabaseLoadError(f"Could not load database: {error}") from error

    def predict_details(self, image_path):
        self._load_database()
        try:
            cropped_bgr, cropped_rgb, detection_source = self.detector.detect_and_crop(image_path)
            if cropped_bgr is None:
                return {"status": "no_detection", "candidates": [], "features": {}, "detection_source": detection_source}
            with third_party_stdout_to_stderr():
                colors, shape = analyze_appearance(cropped_bgr, cropped_rgb)
            candidates = match_appearance_top_three(
                self.database, colors, shape, self.top_k
            )
            return {
                "status": "candidates_found" if candidates else "no_candidates",
                "candidates": candidates,
                "features": {"colors": colors, "shape": shape},
                "detection_source": detection_source,
            }
        except (DatabaseLoadError, InputImageError, ModelLoadError):
            raise
        except Exception as error:
            raise InferenceError(f"Inference failed: {error}") from error

    def predict(self, image_path):
        details = self.predict_details(image_path)
        return {
            "input_image": str(Path(image_path).resolve()),
            "status": details["status"],
            "detected_features": details["features"],
            "predictions": details["candidates"],
            "detection_source": details["detection_source"],
        }
