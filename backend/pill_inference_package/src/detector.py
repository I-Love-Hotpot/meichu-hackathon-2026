from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

from .errors import InputImageError, ModelLoadError
from .console import third_party_stdout_to_stderr


class PillDetector:
    def __init__(self, weights_path, device="cpu", image_size=640, confidence=0.25, low_confidence=0.10, iou=0.7):
        self.weights_path = Path(weights_path)
        self.device = device
        self.image_size = image_size
        self.confidence = confidence
        self.low_confidence = low_confidence
        self.iou = iou
        self.model = None

    def load(self):
        if self.model is not None:
            return self.model
        if not self.weights_path.is_file():
            raise ModelLoadError(f"Detector weights not found: {self.weights_path}")
        try:
            with third_party_stdout_to_stderr():
                model = YOLO(str(self.weights_path))
                if model.task != "detect":
                    raise ModelLoadError(f"Detector task must be 'detect', received: {model.task}")
                model.fuse()
            self.model = model
            return model
        except ModelLoadError:
            raise
        except Exception as error:
            raise ModelLoadError(f"Could not load detector weights {self.weights_path}: {error}") from error

    @staticmethod
    def _pick_crop(image, boxes):
        xyxy = boxes.xyxy.cpu().numpy()
        confidence = boxes.conf.squeeze().cpu().numpy()
        confidence = confidence if confidence.ndim else confidence[None]
        areas = (xyxy[:, 2] - xyxy[:, 0]) * (xyxy[:, 3] - xyxy[:, 1])
        best_index = (confidence * (areas / (areas.max() + 1e-6))).argmax()
        x1, y1, x2, y2 = map(int, xyxy[best_index])
        padding = int(0.08 * max(x2 - x1, y2 - y1))
        height, width = image.shape[:2]
        x1, y1 = max(0, x1 - padding), max(0, y1 - padding)
        x2, y2 = min(width - 1, x2 + padding), min(height - 1, y2 + padding)
        return image[y1:y2, x1:x2]

    def detect_and_crop(self, image_path):
        image_path = Path(image_path)
        image_bgr = cv2.imread(str(image_path))
        if image_bgr is None:
            raise InputImageError(f"Unable to read image: {image_path}")
        model = self.load()
        for confidence, source in ((self.confidence, "yolo_conf_0.25"), (self.low_confidence, "yolo_conf_0.10")):
            try:
                with third_party_stdout_to_stderr():
                    result = model.predict(
                        source=image_bgr, imgsz=self.image_size, conf=confidence, iou=self.iou,
                        device=self.device, verbose=False,
                    )[0]
            except Exception as error:
                raise ModelLoadError(f"Detector inference failed: {error}") from error
            boxes = result.boxes
            if boxes is not None and boxes.xyxy.shape[0] > 0:
                cropped_bgr = self._pick_crop(image_bgr, boxes)
                cropped_rgb = self._pick_crop(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB), boxes)
                if cropped_bgr.size:
                    return cropped_bgr, cropped_rgb, source
        return None, None, "no_detection"