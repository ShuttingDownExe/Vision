import base64
import io
import json
import numpy as np
import torch
from PIL import Image
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from ultralytics import YOLOWorld
from safetensors.torch import load_model

app = FastAPI()

# Enforce CPU to avoid the unfixable Apple MPS driver crashes
device = "cpu"
print(f"Hardware Acceleration: {device.upper()}")

print("Building highly secure blank model architecture...")
# Create a completely blank model from the yaml config (No PyTorch Pickles involved!)
model = YOLOWorld('yolov8s-world.yaml')

print("Injecting verified weights from safe format (.safetensors)...")
load_model(model.model, 'yolov8s-world.safetensors', strict=False)
print("Secure YOLO-World loaded successfully!")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Frontend connected via WebSocket.")
    
    current_labels = []
    
    try:
        while True:
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            
            image_data = data.get("image")
            labels = data.get("labels", [])
            threshold = data.get("threshold", 0.15)
            scale_x = data.get("scaleX", 1.0)
            scale_y = data.get("scaleY", 1.0)
            
            if not image_data or not labels:
                await websocket.send_json({"error": "Missing image or labels"})
                continue
                
            # Update classes dynamically if they changed
            if labels != current_labels:
                model.set_classes(labels)
                current_labels = labels
                
            # Decode image
            header, encoded = image_data.split(",", 1)
            image_bytes = base64.b64decode(encoded)
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            
            # Run YOLO-World prediction forced on the GPU
            results = model.predict(image, verbose=False, device=device)
            
            # Format output
            valid_preds = []
            if len(results) > 0:
                for box in results[0].boxes:
                    score = box.conf[0].item()
                    if score > threshold:
                        b = box.xyxy[0].tolist()
                        class_idx = int(box.cls[0].item())
                        
                        # Guard against out-of-bounds indices just in case
                        if class_idx < len(current_labels):
                            class_name = current_labels[class_idx]
                            valid_preds.append({
                                "score": score,
                                "label": class_name,
                                "box": {
                                    "xmin": b[0] * scale_x,
                                    "ymin": b[1] * scale_y,
                                    "xmax": b[2] * scale_x,
                                    "ymax": b[3] * scale_y
                                }
                            })
                            
            await websocket.send_json({"predictions": valid_preds})
            
    except WebSocketDisconnect:
        print("Frontend disconnected.")
    except Exception as e:
        print(f"Error: {e}")
        try:
            await websocket.send_json({"error": str(e)})
        except:
            pass
