# 顏色／形狀 Top-3 藥物推論套件

輸入藥物圖片後，套件會使用 YOLO 偵測藥丸，再分析顏色與形狀，最後從
`../resources/42_2.csv` 找出三個具有相同顏色與形狀的藥物供參考。

本流程不載入 OCR 模型，也不使用藥錠刻印文字判斷。顏色與形狀相同的藥物可能很多，
因此輸出只能作為候選參考，不能視為醫療辨識結果。

## 安裝

Windows PowerShell：

```powershell
cd C:\Users\11223\Downloads\pill_inference_package\pill_inference_package
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

必要資產：

```text
models/pill_detector.pt
../resources/42_2.csv
config.yaml
```

目前的 `models/pill_detector.pt` 與 `models/best_0920.pt` 模型內容相同。

## 單張圖片

```powershell
python inference.py --image path/to/pill.png --output outputs/prediction.json
```

也可使用虛擬環境中的 Python：

```powershell
.\.venv\Scripts\python.exe inference.py --image path/to/pill.png --output outputs/prediction.json
```

輸出只包含 `pill_id`；每個值都是可直接查詢 MariaDB 的完整許可證字號：

```json
{
  "pill_id": ["內衛成製字第000018號"]
}
```

`pill_id` 最多包含三筆。候選只依資料庫顏色與形狀完全相符，不是藥物辨識機率。

## 整個圖片資料夾

```powershell
python inference.py --batch-dir path/to/images --batch-output-dir outputs/batch
```

每張圖片會各自產生：

```text
outputs/batch/<圖片檔名>/prediction.json
```

例如 `DSC_0000021.jpg` 的結果會寫入：

```text
outputs/batch/DSC_0000021/prediction.json
```

## Python API

```python
from inference import predict

result = predict("path/to/pill.png")
print(result["pill_id"])
```

## 錯誤碼

- Exit `2`：輸入圖片無法讀取。
- Exit `3`：YOLO 模型不存在、不相容或無法載入。
- Exit `4`：資料庫不存在或格式錯誤。
- Exit `5`：其他推論錯誤。

若 YOLO 沒有偵測到藥丸或沒有候選，輸出為 `{ "pill_id": [] }`。
