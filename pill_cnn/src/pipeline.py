from pathlib import Path

import pandas as pd
import yaml

from .detector import PillDetector
from .errors import DatabaseLoadError, InferenceError, InputImageError, ModelLoadError
from .matcher import prepare_database
from .pill_classifier import PillClassifier


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
        classifier_config = self.config.get("classifier", {})
        self.classifier = PillClassifier(
            self._resolve(classifier_config.get("model_weights", "models/cnn/pill_classifier.pt")),
            device=model_config.get("device", "cpu"),
        )
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
            required = {"批價碼", "學名"}
            missing = required - set(self.database.columns)
            if missing:
                raise DatabaseLoadError(f"Database is missing columns: {sorted(missing)}")
        except DatabaseLoadError:
            raise
        except Exception as error:
            raise DatabaseLoadError(f"Could not load database: {error}") from error

    def warm_up(self):
        """Load and validate every runtime asset before accepting requests."""
        self._load_database()
        self.detector.load()
        self.classifier._load()
        for classifier_id in self.classifier.classes:
            value = str(classifier_id).strip()
            if len(value) != 6 or not value.isdigit():
                raise ModelLoadError(
                    f"Classifier ID {value!r} must contain exactly six digits"
                )

    def predict_details(self, image_path):
        self._load_database()
        try:
            cropped_bgr, cropped_rgb, detection_source = self.detector.detect_and_crop(image_path)
            if cropped_bgr is None:
                return {"candidates": []}
            candidates = self.classifier.predict(
                cropped_rgb, self.database, self.top_k
            )
            return {"candidates": candidates}
        except (DatabaseLoadError, InputImageError, ModelLoadError):
            raise
        except Exception as error:
            raise InferenceError(f"Inference failed: {error}") from error

    def predict(self, image_path):
        details = self.predict_details(image_path)
        predictions = []
        pill_ids = set()
        for candidate in details.get("candidates", [])[:3]:
            pill_id = str(candidate["pill_id"]).strip()
            if len(pill_id) != 6 or not pill_id.isdigit():
                raise ModelLoadError(
                    f"Classifier ID {pill_id!r} must contain exactly six digits"
                )
            if pill_id in pill_ids:
                continue
            pill_ids.add(pill_id)
            predictions.append(
                {
                    "pill_id": pill_id,
                    "drug_name": str(candidate.get("drug_name", "")).strip(),
                    "score": round(float(candidate["score"]), 6),
                }
            )
        return {"predictions": predictions}
