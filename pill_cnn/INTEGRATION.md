# Backend integration

The production integration is HTTP-based. The Node backend sends raw image
bytes to the inference container and accepts only this response shape:

```json
{ "predictions": [{ "pill_id": "018251", "drug_name": "Example medicine", "score": 0.923456 }] }
```

For direct Python usage:

```python
from inference import predict

result = predict("path/to/pill.jpg")
for prediction in result["predictions"]:
    print(prediction["pill_id"], prediction["score"])
```

Required runtime assets are documented in `README.md`. `src/pipeline.py`
returns each classifier ID unchanged as a zero-padded six-digit string together
with its confidence score. The Node backend resolves those IDs against MariaDB.
