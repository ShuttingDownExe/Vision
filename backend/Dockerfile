FROM python:3.11-slim
WORKDIR /app

# Install system dependencies needed for opencv and ultralytics
# Using libgl1 instead of libgl1-mesa-glx for newer Debian (Trixie/Bookworm) support
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 git && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Generate the secure safetensors model securely from the source weights
COPY prepare.py .
RUN python prepare.py && rm yolov8s-worldv2.pt

# Pre-download the CLIP model weights into the Docker image for Air-Gapped security
# We do this by initializing the model and forcing it to embed a test word
RUN python -c "from ultralytics import YOLOWorld; from safetensors.torch import load_model; m = YOLOWorld('yolov8s-world.yaml'); load_model(m.model, 'yolov8s-world.safetensors'); m.set_classes(['test'])"

# Copy the server code
COPY server.py .

EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
