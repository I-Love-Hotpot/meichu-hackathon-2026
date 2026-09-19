import itertools
import re

import pandas as pd

VALID_COLORS = ["白色", "透明", "黑色", "棕色", "紅色", "橘色", "皮膚色", "黃色", "綠色", "藍色", "紫色", "粉紅色", "灰色"]
VALID_SHAPES = ["圓形", "橢圓形", "其他"]


def prepare_database(dataframe):
    """Convert the Taiwan FDA CSV schema to the original matcher field contract."""
    original_columns = {"用量排序", "批價碼", "文字", "顏色", "形狀"}
    if original_columns.issubset(dataframe.columns):
        return dataframe
    source_columns = {"許可證字號", "中文品名", "形狀", "顏色", "標註一", "標註二"}
    if not source_columns.issubset(dataframe.columns):
        missing = source_columns - set(dataframe.columns)
        raise ValueError(f"Unsupported database schema; missing columns: {sorted(missing)}")

    def text(value):
        if pd.isna(value):
            return "NONE"
        cleaned = re.sub(r"[^A-Z0-9-]", "", str(value).upper())
        return cleaned or "NONE"

    def colors(value):
        aliases = (("透明", "透明"), ("白", "白色"), ("黑", "黑色"), ("棕", "棕色"), ("褐", "棕色"),
                   ("紅", "紅色"), ("橘", "橘色"), ("橙", "橘色"), ("膚", "皮膚色"), ("黃", "黃色"),
                   ("綠", "綠色"), ("藍", "藍色"), ("紫", "紫色"), ("粉", "粉紅色"), ("灰", "灰色"))
        names = []
        for part in str(value if not pd.isna(value) else "").split(";;;"):
            for source, target in aliases:
                if source in part:
                    names.append(target)
                    break
        return "|".join(dict.fromkeys(names))

    def shape(value):
        values = str(value if not pd.isna(value) else "").split(";;;")
        if any(item.strip() == "圓形" for item in values):
            return "圓形"
        if any("橢圓" in item for item in values):
            return "橢圓形"
        return "其他"

    licenses = dataframe["許可證字號"].astype(str).str.strip()
    numeric_ids = licenses.map(lambda license_id: (re.findall(r"\d+", license_id) or [license_id])[-1].zfill(6))
    numeric_counts = numeric_ids.value_counts()
    output_ids = [numeric_id if numeric_counts[numeric_id] == 1 else license_id for license_id, numeric_id in zip(licenses, numeric_ids)]

    normalized = pd.DataFrame({
        "用量排序": range(1, len(dataframe) + 1),
        "批價碼": output_ids,
        "學名": dataframe["中文品名"].fillna(dataframe.get("英文品名", "")).astype(str).str.strip(),
        "文字": [f"F:{text(front)}|B:{text(back)}" for front, back in zip(dataframe["標註一"], dataframe["標註二"])],
        "顏色": dataframe["顏色"].map(colors),
        "形狀": dataframe["形狀"].map(shape),
    })
    return normalized[normalized["批價碼"].ne("")].copy()


def lcs_score(left, right):
    left, right = left.lower(), right.lower()
    matrix = [[0] * (len(right) + 1) for _ in range(len(left) + 1)]
    for left_index, left_char in enumerate(left):
        for right_index, right_char in enumerate(right):
            matrix[left_index + 1][right_index + 1] = matrix[left_index][right_index] + 1 if left_char == right_char else max(matrix[left_index][right_index + 1], matrix[left_index + 1][right_index])
    return matrix[-1][-1] / max(len(left), len(right))


def make_appearance_indexes(dataframe):
    color_index = {color: [] for color in VALID_COLORS}
    shape_index = {shape: [] for shape in VALID_SHAPES}
    for _, row in dataframe.iterrows():
        if pd.isna(row.get("用量排序")):
            continue
        row_id = int(row["用量排序"])
        shape_index[row.get("形狀", "") if row.get("形狀", "") in shape_index else "其他"].append(row_id)
        for color in str(row.get("顏色", "")).split("|"):
            if color.strip() in color_index:
                color_index[color.strip()].append(row_id)
    return color_index, shape_index


def match_appearance_top_three(dataframe, colors, shape, top_k=3):
    """Return up to ``top_k`` drugs with the same detected colour(s) and shape.

    OCR text and imprint columns are intentionally ignored.  Because colour and
    shape alone cannot distinguish drugs that share the same appearance, exact
    matches have the same reference score and are ordered by pill identifier.
    """
    detected_colors = {color.strip() for color in colors if color and color.strip()}
    if not detected_colors or not shape:
        return []

    matches = []
    for _, row in dataframe.iterrows():
        database_colors = {
            color.strip()
            for color in str(row.get("顏色", "")).split("|")
            if color.strip()
        }
        if database_colors != detected_colors or str(row.get("形狀", "")) != shape:
            continue

        pill_id = str(row.get("批價碼", "")).strip()
        if not pill_id:
            continue
        matches.append(
            {
                "pill_id": pill_id,
                "drug_name": str(row.get("學名", "")).strip(),
                "appearance_score": 1.0,
                "colors": sorted(database_colors),
                "shape": shape,
            }
        )

    return sorted(matches, key=lambda item: item["pill_id"])[:top_k]


def match_top_three(ocr_texts, dataframe, colors, shape, color_index, shape_index, threshold, top_k=3):
    candidate_ids = None
    for color in colors:
        ids = set(color_index.get(color, []))
        candidate_ids = ids if candidate_ids is None else candidate_ids & ids
    if shape:
        ids = set(shape_index.get(shape, []))
        candidate_ids = ids if candidate_ids is None else candidate_ids & ids
    if candidate_ids is not None:
        dataframe = dataframe[dataframe["用量排序"].isin(candidate_ids)]
    if dataframe.empty or not ocr_texts:
        return []
    combined = "".join(ocr_texts).upper()
    if any(keyword in combined for keyword in ("ACETYLCYSTEINE", "ACTEIN")):
        special_rows = dataframe[dataframe["文字"].str.contains("ACETYLCYSTEINE|ACTEIN", case=False, na=False)]
        if not special_rows.empty:
            row = special_rows.iloc[0]
            pill_id = str(row.get("批價碼", "")).strip()
            if pill_id:
                return [{"pill_id": pill_id, "score": 1.0, "row": row, "side": "F"}]
    matches = {}
    for permutation in itertools.permutations(ocr_texts):
        recognized = "".join(permutation).upper()
        for _, row in dataframe.iterrows():
            sides = {part.split(":", 1)[0].strip().upper(): part.split(":", 1)[1].strip().upper() for part in str(row.get("文字", "")).split("|") if ":" in part}
            for side in ("F", "B"):
                if not sides.get(side):
                    continue
                score = lcs_score(recognized, sides[side])
                if score < threshold:
                    continue
                pill_id = str(row.get("批價碼", "")).strip()
                if pill_id and (pill_id not in matches or score > matches[pill_id]["score"]):
                    matches[pill_id] = {"pill_id": pill_id, "score": score, "row": row, "side": side}
    return sorted(matches.values(), key=lambda item: item["score"], reverse=True)[:top_k]
