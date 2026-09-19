FROM python:3.11-slim-bookworm

WORKDIR /app

COPY pill_inference_package/requirements.txt ./pill_inference_package/requirements.txt

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch torchvision \
    && pip install --no-cache-dir -r pill_inference_package/requirements.txt

COPY pill_inference_package ./pill_inference_package
COPY resources ./resources

WORKDIR /app/pill_inference_package

ENV PORT=8000

EXPOSE 8000

CMD ["python", "server.py"]
