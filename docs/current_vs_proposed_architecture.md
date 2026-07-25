# Architecture Evolution: Current PoC vs. Proposed Enterprise State

As this AI Vision project scales from a local prototype to a fleet of remote edge servers, the architecture must transition from a heavy, flexible generalized model to a streamlined, secure, and automated production system.

## 1. The AI Model Architecture
| Feature | Current State (Proof of Concept) | Proposed State (Enterprise Production) |
| :--- | :--- | :--- |
| **Model Type** | **YOLO-World (Zero-Shot)** | **YOLOv8 Nano (Distilled/Fine-Tuned)** |
| **Capabilities** | Open-vocabulary. Can detect any object by typing a text prompt (e.g., "cigarette"). | Closed-vocabulary. Hardcoded to detect only specific, highly-trained classes (e.g., "cigarette", "hardhat"). |
| **Performance** | Very heavy. Requires loading OpenAI's CLIP text-encoder into memory alongside the vision model. | Ultra-lightweight. Runs at extremely high FPS on low-power edge devices with minimal RAM footprint. |
| **Accuracy** | Good generalized accuracy, but struggles with tiny edge cases on blurry, low-res CCTV footage. | Exceptional accuracy. Hyper-specialized on the exact lighting, angles, and resolution of your actual plant CCTV cameras. |

## 2. Infrastructure & Deployment
| Feature | Current State (Proof of Concept) | Proposed State (Enterprise Production) |
| :--- | :--- | :--- |
| **Hosting** | Local `k3d` Kubernetes cluster running on a developer's Mac. | Fleet of remote edge Kubernetes clusters (e.g., K3s, AKS Edge). |
| **Deployment Method** | Manual `kubectl apply` or executing a `Makefile` over SSH. | **GitOps (ArgoCD)**. Edge devices automatically pull updates from a secure Git repository. |
| **Network Security** | Localhost only. No external security perimeter defined. | **Zero-Trust Pull Architecture**. Remote firewalls drop all incoming traffic. Devices connect outbound via secure tunnels (Tailscale/Cloudflare). |
| **Container Strategy** | Docker images built manually from the command line. | Fully automated CI/CD pipeline building cryptographically signed, 100% air-gapped Docker images. |

## 3. Data & MLOps Lifecycle
| Feature | Current State (Proof of Concept) | Proposed State (Enterprise Production) |
| :--- | :--- | :--- |
| **Dataset Generation** | None. Relies entirely on the internet pre-training of the YOLO-World model. | **The Data Flywheel**. Edge devices flag low-confidence events and upload CCTV clips to central storage for continuous learning. |
| **Labeling** | Not applicable. | **Auto-Labeling**. The YOLO-World PoC model acts as a robotic labeler, generating thousands of annotations automatically, with humans only correcting the final 10%. |
| **Model Updating** | Static. The model never improves or learns from its mistakes. | **Automated CI/CD Retraining**. When new data is verified, Azure Machine Learning automatically spins up GPUs, fine-tunes a new model, and pushes it to the registry. |
