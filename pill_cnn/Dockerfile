FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000 \
    YOLO_CONFIG_DIR=/tmp/ultralytics

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cpu \
        torch==2.5.1 torchvision==0.20.1

COPY requirements.runtime.txt ./requirements.runtime.txt

RUN python -m pip install --no-cache-dir -r requirements.runtime.txt

COPY config.yaml inference.py server.py ./
COPY src/__init__.py src/console.py src/detector.py src/errors.py \
    src/matcher.py src/pill_classifier.py src/pipeline.py ./src/
COPY database/42_2.csv ./database/42_2.csv
COPY models/pill_detector.pt ./models/pill_detector.pt
COPY models/cnn/pill_classifier.pt ./models/cnn/pill_classifier.pt

RUN useradd --create-home --uid 10001 app \
    && chown -R app:app /app

USER app

EXPOSE 8000

CMD ["python", "server.py"]
