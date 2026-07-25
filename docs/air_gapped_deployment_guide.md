# Air-Gapped CI/CD Deployment Guide

Deploying software to a remote location with strictly **zero internet access** (an "air-gapped" environment) requires shifting all dependency resolution, model downloading, and packaging to a secure, internet-connected Build Server. 

Because we specifically designed your Docker images to bake the Safetensors model and the OpenAI CLIP text-encoder directly into the image layers, your application is already **100% compliant** with air-gapped architectures.

Here is the step-by-step pipeline you should implement for your CI/CD.

## Phase 1: Continuous Integration (The Build Server)
This phase occurs on an internet-connected CI server (e.g., GitHub Actions, GitLab CI, or Jenkins).

1. **Build the Images:** The CI server builds the frontend and backend Docker images. During the backend build, Docker reaches out to the internet, downloads the required PyTorch/Ultralytics libraries, and caches the CLIP model weights permanently inside the image.
   ```bash
   docker build -t vision-frontend:v1.0 .
   docker build -t vision-backend:v1.0 backend/
   ```
2. **Export to Tarballs:** Instead of pushing the images to a cloud registry (like DockerHub or Azure), the CI server exports the raw image binaries into `.tar` archive files.
   ```bash
   docker save vision-frontend:v1.0 -o vision-frontend.tar
   docker save vision-backend:v1.0 -o vision-backend.tar
   ```
3. **Package the Release:** The CI pipeline zips the two `.tar` files alongside your `k8s.yaml` configuration into a single release bundle (e.g., `release-v1.0.zip`).

## Phase 2: Crossing the Air Gap (The Transfer)
Because the edge server has no internet, the `release-v1.0.zip` bundle must be physically or securely transferred across the air gap. 
Depending on your enterprise security protocols, this is typically done via:
* **Sneakernet:** Copying the file to a secure, encrypted USB drive and physically plugging it into the remote server.
* **Data Diode:** Sending the file over a strictly one-way network hardware link.
* **Secure Bastion Host:** SCP/SFTP transfer through an heavily audited jump server.

## Phase 3: Continuous Deployment (The Edge Server)
This phase occurs on the isolated remote server running Kubernetes (e.g., K3s, K3d, or MicroK8s).

1. **Unpack the Release:** Extract the `release-v1.0.zip` bundle on the remote server.
2. **Load Images into the Local Registry:** Import the `.tar` binaries directly into the server's local container engine. The server does not need to contact DockerHub.
   ```bash
   # If using standard Docker/Kubernetes:
   docker load -i vision-frontend.tar
   docker load -i vision-backend.tar
   
   # If using K3d (like our local PoC):
   k3d image import vision-frontend.tar vision-backend.tar -c my-cluster
   ```
3. **Apply the Manifests:** Apply the Kubernetes configuration. The cluster will immediately spin up the pods using the locally loaded images.
   ```bash
   kubectl apply -f k8s.yaml
   ```

### Why this works so well for your architecture:
Because we stripped out the insecure `.pt` files and forced the CLIP text-encoder to download during the `docker build` phase, the `vision-backend.tar` file is a completely hermetic seal. When it boots up on the remote edge server, it has absolutely no need to contact HuggingFace, OpenAI, or Ultralytics APIs. It will start instantly and securely.
