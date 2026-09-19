# Backend integration

The production integration is HTTP-based. The Node backend sends raw image
bytes to the inference container and accepts only this response shape:

```json
{ "pill_id": ["018251"] }
```

For direct Python usage:

```python
from inference import predict

result = predict("path/to/pill.jpg")
for pill_id in result["pill_id"]:
    print(pill_id)
```

Required runtime assets are documented in `README.md`. `src/pipeline.py`
returns each classifier ID unchanged as a zero-padded six-digit string. The
Node backend resolves those IDs against MariaDB.
