# Industrial AI Vision System

## Objective
An enterprise-grade computer vision system designed to monitor factory and plant CCTV footage in real-time. The primary objectives are to enforce workplace safety protocols by:
1. **Detecting unauthorized smoking:** Identifying tiny, rare events like individuals holding or dropping cigarettes on the factory floor.
2. **Monitoring PPE Compliance:** Utilizing composite geometric logic to detect workers operating without proper Personal Protective Equipment (e.g., hardhats, safety vests).

## High-Level Overview
This repository contains a full-stack, air-gapped Proof of Concept (PoC) designed to evolve into a continuous MLOps enterprise architecture.

* **Frontend:** A responsive React UI that connects to the AI backend via WebSockets to stream real-time bounding box detections.
* **Backend:** A highly secure FastAPI Python server running an offline zero-shot YOLO-World model. The system strictly utilizes cryptographically safe `.safetensors` model weights to prevent supply-chain vulnerabilities inherent in standard PyTorch `.pt` files.
* **Infrastructure:** Fully containerized via Docker and orchestrated using Kubernetes (`k3d` for local testing). The deployment is engineered to be 100% self-sufficient for zero-internet, air-gapped remote edge servers.

## Quick Start
To spin up the entire architecture locally (requires Docker and k3d):
```bash
make all
```
The React application will be accessible at `http://localhost:8080`. 
Use `make stop` to hibernate the cluster, and `make clean` to tear it down.

## Architecture & Enterprise Documentation
We have drafted comprehensive blueprints for transitioning this PoC into a massive-scale enterprise deployment. Please review the following architectural decision records and guides:

* 🏗️ **[Architecture Evolution: PoC vs. Enterprise Production](docs/current_vs_proposed_architecture.md)**
* 🧠 **[Continuous MLOps & Data Flywheel Architecture](docs/mlops_continuous_training_architecture.md)** 
* 🛡️ **[Edge Security Architecture (Limited Internet / GitOps)](docs/edge_security_architecture.md)**
* 🔌 **[Air-Gapped Deployment Guide (Zero Internet)](docs/air_gapped_deployment_guide.md)**
* 🚨 **[Big Problems Solved (Vulnerabilities, Apple MPS, Rare Events)](docs/big_problems.md)**
