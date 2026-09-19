"""MobileNetV3 classifier trained with reference and augmented phone images."""

from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torchvision import transforms
from torchvision.models import mobilenet_v3_small

from .errors import ModelLoadError


class PillClassifier:
    def __init__(self, weights_path, device="cpu"):
        self.weights_path = Path(weights_path)
        self.device = device
        self.model = None
        self.classes = None
        self.preprocess = transforms.Compose(
            [
                transforms.Resize(256),
                transforms.CenterCrop(224),
                transforms.ToTensor(),
                transforms.Normalize(
                    mean=[0.485, 0.456, 0.406],
                    std=[0.229, 0.224, 0.225],
                ),
            ]
        )

    def _load(self):
        if self.model is not None:
            return
        if not self.weights_path.is_file():
            raise ModelLoadError(f"Pill classifier weights not found: {self.weights_path}")
        try:
            checkpoint = torch.load(
                self.weights_path, map_location=self.device, weights_only=False
            )
            self.classes = checkpoint["classes"]
            model = mobilenet_v3_small(weights=None)
            model.classifier[3] = torch.nn.Linear(
                model.classifier[3].in_features, len(self.classes)
            )
            model.load_state_dict(checkpoint["state_dict"])
            model.eval().to(self.device)
            self.model = model
        except Exception as error:
            raise ModelLoadError(f"Could not load pill classifier: {error}") from error

    @staticmethod
    def _to_image(cropped_rgb):
        if isinstance(cropped_rgb, np.ndarray):
            return Image.fromarray(cropped_rgb.astype(np.uint8), mode="RGB")
        return Image.open(cropped_rgb).convert("RGB")

    def predict(self, cropped_rgb, database, top_k=3):
        self._load()
        tensor = self.preprocess(self._to_image(cropped_rgb)).unsqueeze(0).to(self.device)
        with torch.inference_mode():
            probabilities = torch.softmax(self.model(tensor), dim=1)[0]
        metadata = {
            str(row.get("批價碼", "")).strip(): row
            for _, row in database.iterrows()
        }
        scores, indexes = probabilities.topk(min(top_k, len(self.classes)))
        predictions = []
        for score, index in zip(scores.tolist(), indexes.tolist()):
            pill_id = self.classes[index]
            row = metadata.get(pill_id)
            predictions.append(
                {
                    "pill_id": pill_id,
                    "drug_name": str(row.get("學名", "")).strip() if row is not None else "",
                    "score": round(float(score), 6),
                }
            )
        return predictions
