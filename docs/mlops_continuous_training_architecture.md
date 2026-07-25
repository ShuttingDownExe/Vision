# Continuous MLOps Architecture for Edge Vision

Transitioning from a prototype to a production environment processing choppy, low-resolution CCTV footage requires a shift in both model architecture and operational infrastructure. 

Here is the blueprint for an enterprise MLOps pipeline that continuously fine-tunes your model on real-world data and automatically deploys the smartest version to your remote edge servers.

---

## 1. Model Strategy: From Zero-Shot to Distilled
Currently, you are using **YOLO-World**, which is an "Open Vocabulary" model. It is very heavy because it uses OpenAI's CLIP text-encoder to dynamically understand words it has never seen before. 

**Will fine-tuning make it more efficient?** Yes, drastically. 
If your production goal is strictly to detect specific hazards (like "cigarettes" and "knives"), you do not need a massive language model attached to your vision system. 
**The Solution:** Use your YOLO-World model as an "Auto-Labeler" to generate a massive dataset, and then train a much smaller, standard **YOLOv8 Nano (YOLOv8n)** or **YOLOv8 Small (YOLOv8s)** model strictly on those classes. A standard YOLOv8 model runs significantly faster, uses less RAM, and when fine-tuned on your exact CCTV camera angles, will be vastly more accurate at catching tiny objects on the floor than a generic YOLO-World model.

### How to Generate the Massive Dataset (Auto-Labeling)
Generating thousands of labeled images by hand is incredibly tedious. Instead, you can automate 90% of the work using your current YOLO-World PoC:
1. **Record Raw Footage:** Collect hours of raw, unlabelled video from your actual CCTV cameras so the data perfectly matches your production lighting and angles.
2. **Run the Auto-Labeler Script:** Write a Python script that runs your heavy YOLO-World model over the recorded footage on a powerful backend server. Set the classes to `['cigarette', 'firearm', 'knife']`. 
3. **Save High-Confidence Hits:** Whenever YOLO-World detects a hazard with >70% confidence, the script saves that video frame as a `.jpg` and automatically generates the corresponding YOLO bounding box `.txt` file. 
4. **Human Review (The 10%):** Upload these thousands of auto-generated images/boxes into a tool like **CVAT** or **Roboflow**. It takes a human mere seconds to verify or slightly adjust an existing bounding box, compared to minutes to draw them from scratch.
5. **Hard-Negative Mining:** If you notice YOLO-World is completely missing tiny cigarettes on the floor, manually scrub through the footage, find those exact frames, and draw the boxes yourself. This teaches the final model exactly what the edge cases look like.

### Handling Rare Events (The "Cigarette" Problem)
If safety protocols are working, you won't naturally capture enough real CCTV footage of people smoking to train a robust model. To solve this data scarcity:
* **Staged Footage (Physical Synthetic Data):** Before production, spend a few hours deliberately staging the hazards. Have employees walk through the plant smoking, dropping cigarettes, and holding knives while the CCTV records. This gives you perfectly accurate lighting and angles for rare events.
* **Copy-Paste Augmentation (Digital Synthetic Data):** Take high-quality photos of cigarettes and use Python scripts to digitally "paste" them onto random spots on the floor of your empty CCTV background frames during training.
* **Open-Source Datasets:** Merge your small custom dataset with massive open-source datasets (like Roboflow Universe) that already contain tens of thousands of labeled cigarettes. 

### Multi-Class Logic (PPE Compliance)
For PPE compliance, you should not try to train a single class called "person without PPE" because it is too visually ambiguous. Instead, use a **Compositional Logic** approach:
1. Train the model to detect `['person', 'hard hat', 'safety vest']`. 
2. In your Python backend, write geometric logic: *If a 'person' bounding box does not have a 'hard hat' bounding box overlapping its top 20%, trigger a No-PPE alert.*
3. You can use YOLO-World to auto-label the 'hard hat' and 'safety vest' classes on your staged/real CCTV footage to rapidly build the PPE dataset.

---

## 2. The Data Flywheel (Continuous Learning)
To ensure the model works on real CCTV footage, you must build a "Data Flywheel."

1. **Edge Inference & Shadow Mode:** Deploy your model to the edge. When the model detects a hazard (or flags a "low confidence" detection), the edge device automatically clips a 5-second video segment and securely uploads it to your central cloud storage (e.g., Azure Blob Storage).
2. **Active Learning (Human-in-the-Loop):** The uploaded CCTV clips are sent to a labeling platform (like CVAT, Label Studio, or Roboflow). Human reviewers quickly correct any mistakes (e.g., drawing a tighter box around a cigarette).
3. **Dataset Versioning:** The corrected images are merged into your master dataset. You use a tool like **DVC (Data Version Control)** to version the dataset, exactly like Git versions your code.

---

## 3. Automated MLOps Pipeline (The Training Brain)
When your master dataset grows by a certain threshold (e.g., 500 new corrected images), an automated CI/CD pipeline is triggered.

1. **Automated Fine-Tuning:** A GitHub Action triggers a cloud GPU instance (e.g., Azure Machine Learning compute cluster). The cluster pulls the latest dataset and runs a YOLOv8 training script to fine-tune the model.
2. **Automated Evaluation:** The pipeline tests the newly trained model against a strict "golden" validation dataset of hard CCTV edge-cases. 
3. **Model Registry Push:** If the new model beats the accuracy of the current production model, the pipeline exports it to `.safetensors` and pushes it to your secure Azure Model Registry (or Docker Registry) as `vision-backend:v2.0`.

---

## 4. Zero-Touch Edge Deployment (GitOps)
Once the new, smarter model is in the registry, we need to push it to your remote edge devices without flying across the world.

1. **GitOps Trigger:** Your MLOps pipeline automatically updates the `k8s.yaml` file in your GitHub repository to point to `vision-backend:v2.0`.
2. **ArgoCD / Flux Sync:** The Kubernetes clusters on your remote edge servers (which have limited internet) are running a GitOps controller like ArgoCD. 
3. **The Secure Pull:** ArgoCD periodically polls your GitHub repository over outbound HTTPS. It notices the `k8s.yaml` file changed. It securely pulls down the new configuration, reaches out to the Azure Registry, downloads the new `v2.0` Docker image, and performs a rolling restart of your Pods.

**The Result:** The model on a remote oil rig or factory floor gets smarter overnight, entirely automatically, without a single inbound firewall port being opened.

---

## 5. Model Training Environments (Where to Train)
To execute the fine-tuning step in the pipeline, you need access to NVIDIA GPUs. Depending on what stage of development you are in, here is a detailed breakdown of the two best options:

### Option A: Google Colab Pro (For Prototyping & Sandbox)
Before writing automation scripts, you should manually train the first version of your custom YOLOv8 model to understand the hyper-parameters and dataset quality.
* **The Setup:** Google Colab provides a free/cheap Jupyter Notebook environment hosted in the cloud. By upgrading to Colab Pro ($10/month), you gain access to powerful GPUs like the NVIDIA A100 or V100.
* **The Workflow:** 
  1. Zip your Roboflow/custom dataset and upload it to Google Drive.
  2. Mount your Google Drive in the Colab notebook.
  3. Run a single command in the notebook: `!yolo train data=/content/drive/MyDrive/dataset/data.yaml model=yolov8n.pt epochs=100 imgsz=640`
  4. After 1-2 hours, download the resulting `best.pt` model weights file to your local Mac.
  5. Run our local `prepare.py` script to securely convert it to `.safetensors`.
* **When to use:** Use this for the initial Proof of Concept (PoC), debugging bad datasets, and confirming that your CCTV angles are viable before committing to enterprise cloud resources.

### Option B: Azure Machine Learning (For Automated Production MLOps)
Once the dataset is proven, the training process must be automated so it happens without human intervention. Azure Machine Learning (Azure ML) perfectly integrates with the AKS edge deployments.
* **The Setup:** In Azure ML, you configure a "Compute Cluster" of GPU nodes (e.g., `Standard_NC6s_v3` with NVIDIA V100s). You configure the cluster to scale down to `0` nodes when idle, meaning you pay exactly $0.00 when the model isn't actively training.
* **The Workflow:**
  1. A human reviewer approves new CCTV frames in your labeling tool, which triggers a GitHub Action webhook.
  2. The GitHub Action commands Azure ML to start a training job. The Compute Cluster scales from 0 to 1 GPU node.
  3. Azure ML automatically mounts your Azure Blob Storage (where the dataset lives), pulls the YOLOv8 Docker image, and runs the training script.
  4. The Python script within Azure ML evaluates the new model. If it passes accuracy checks, the script dynamically runs the `.safetensors` conversion protocol.
  5. Azure ML pushes the secure `.safetensors` file directly into your **Azure Model Registry**. The GPU cluster immediately scales back to 0 to stop billing.
  6. Your remote Edge GitOps (ArgoCD) detects the new version in the registry and pulls it down to the factory floor.
* **When to use:** Use this for the production Data Flywheel. It completely removes the developer from the loop, turning raw CCTV footage into smarter edge models entirely autonomously.
