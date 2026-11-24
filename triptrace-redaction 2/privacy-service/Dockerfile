# Privacy gateway. NOT built or run in the authoring sandbox (downloads were blocked there):
# build it once on your machine and check /health before the demo.
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends git curl libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir git+https://github.com/ultralytics/CLIP.git

COPY redaction.py detectors.py app.py build_vocab.py ./

# Models are fetched at build time so the running container needs no internet.
RUN mkdir /models \
    && curl -fsSL -o /models/face_detection_yunet_2023mar.onnx \
       https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx \
    && python build_vocab.py /models/triptrace-vocab.pt \
    && rm -f yolov8s-worldv2.pt

RUN useradd --system --no-create-home privacy
USER privacy
EXPOSE 8100
CMD ["uvicorn", "app:main_app", "--factory", "--host", "0.0.0.0", "--port", "8100"]
