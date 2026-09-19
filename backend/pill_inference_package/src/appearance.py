from collections import Counter

import cv2
import numpy as np
from sklearn.cluster import KMeans


def _color_name(rgb):
    hsv = cv2.cvtColor(np.uint8([[rgb[::-1]]]), cv2.COLOR_BGR2HSV)[0][0]
    hue, saturation, value = int(hsv[0]) * 2, int(hsv[1]), int(hsv[2])
    red, green, blue = rgb
    if value < 30:
        return "黑色"
    if saturation < 55:
        return "白色"
    if (hue < 20 or hue >= 330) and saturation > 70 and red > 50:
        return "紅色"
    if (saturation < 35 and 35 < value < 220) or (196 < hue < 250 and saturation < 100 and value < 100):
        return "灰色"
    if hue < 40 or (hue > 195 and value < 100):
        return "棕色" if value < 80 else "橘色"
    if hue < 75:
        return "黃色"
    if hue < 195:
        return "綠色"
    if hue < 250:
        return "藍色"
    if hue < 300:
        return "紫色"
    return "粉紅色"


def _shape(image_bgr):
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    corrected = cv2.addWeighted(cv2.divide(gray, cv2.GaussianBlur(gray, (25, 25), 0), scale=255), 0.5,
                                cv2.divide(gray, cv2.GaussianBlur(gray, (75, 75), 0), scale=255), 0.5, 0)
    _, threshold = cv2.threshold(corrected, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    threshold = cv2.morphologyEx(cv2.morphologyEx(threshold, cv2.MORPH_CLOSE, kernel), cv2.MORPH_OPEN, kernel)
    contours, _ = cv2.findContours(threshold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours or len(max(contours, key=cv2.contourArea)) < 5:
        return "其他"
    _, axes, _ = cv2.fitEllipse(max(contours, key=cv2.contourArea))
    ratio = max(axes) / min(axes) if min(axes) else 0
    if 1 <= ratio <= 1.2:
        return "圓形"
    if ratio <= 3.8:
        return "橢圓形"
    return "其他"


def _colors(image, clusters=3, min_ratio=0.35):
    pixels = image.reshape((-1, 3))
    model = KMeans(n_clusters=min(clusters, len(pixels)), n_init=10, random_state=42).fit(pixels)
    counts = Counter(model.labels_)
    ordered = [model.cluster_centers_[index] for index, _ in counts.most_common()]
    non_black = []
    for color in ordered:
        _, _, value = cv2.cvtColor(np.uint8([[color[::-1]]]), cv2.COLOR_BGR2HSV)[0][0]
        if value >= 40:
            non_black.append(color)
    merged = []
    for index, color in enumerate(non_black):
        hue, saturation, value = cv2.cvtColor(np.uint8([[color[::-1]]]), cv2.COLOR_BGR2HSV)[0][0]
        current = (int(hue) * 2, int(saturation), int(value))
        for merged_color in merged:
            old_hue, old_saturation, old_value = merged_color["hsv"]
            hue_gap = min(abs(current[0] - old_hue), 360 - abs(current[0] - old_hue))
            similar = abs(current[2] - old_value) < 120 if current[1] < 30 and old_saturation < 30 else (
                hue_gap <= 20 and abs(current[1] - old_saturation) <= 70 and abs(current[2] - old_value) <= 70
            )
            if similar:
                merged_color["count"] += counts[counts.most_common()[index][0]]
                break
        else:
            merged.append({"rgb": tuple(map(int, color)), "hsv": current, "count": counts[counts.most_common()[index][0]]})
    total = sum(item["count"] for item in merged)
    filtered = [item for item in merged if total and item["count"] / total >= min_ratio]
    if not filtered and merged:
        filtered = [max(merged, key=lambda item: item["count"])]
    return [_color_name(item["rgb"]) for item in filtered]


def analyze_appearance(cropped_bgr, cropped_rgb):
    shape = _shape(cropped_bgr)
    height, width = cropped_rgb.shape[:2]
    margin_x, margin_y = int(width * 0.06), int(height * 0.06)
    inner = cropped_rgb[margin_y:max(height - margin_y, margin_y + 1), margin_x:max(width - margin_x, margin_x + 1)].copy()
    inner_height, inner_width = inner.shape[:2]
    side = max(1, int(min(inner_width, inner_height) * 0.6))
    center_x, center_y = inner_width // 2, inner_height // 2
    sample = inner[max(center_y - side // 2, 0):min(center_y + side // 2, inner_height), max(center_x - side // 2, 0):min(center_x + side // 2, inner_width)]
    hsv = cv2.cvtColor(sample, cv2.COLOR_RGB2HSV)
    hue, saturation, value = cv2.split(hsv)
    value[value > 235] = 255
    value[value <= 235] += 20
    bright = cv2.cvtColor(cv2.merge((hue, saturation, value)), cv2.COLOR_HSV2RGB)
    return list(dict.fromkeys(_colors(bright))) or ["其他"], shape