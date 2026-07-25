from ultralytics import YOLOWorld
from safetensors.torch import save_file

print("Downloading YOLOv8s-World...")
# This automatically downloads the .pt file from Ultralytics
model = YOLOWorld('yolov8s-worldv2.pt')

print("Extracting weights and saving to safetensors...")
state_dict = model.model.state_dict()
save_file(state_dict, 'yolov8s-world.safetensors')

print("Done!")
