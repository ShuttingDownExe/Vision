.PHONY: all cluster build deploy clean stop start

all: cluster build deploy

cluster:
	@echo "Creating K3d Cluster..."
	k3d cluster delete vision-poc 2>/dev/null || true
	k3d cluster create vision-poc -p "8080:30080@server:0" -p "8000:30000@server:0"

build:
	@echo "Building Docker Images..."
	docker build -t vision-frontend:latest .
	docker build -t vision-backend:latest backend/

deploy:
	@echo "Loading Images into K3d Registry..."
	k3d image import vision-frontend:latest vision-backend:latest -c vision-poc
	@echo "Applying Kubernetes Configurations..."
	kubectl apply -f k8s.yaml
	@echo "Waiting for Pods to be Ready..."
	kubectl wait --for=condition=ready pod -l app=vision-backend --timeout=120s
	kubectl wait --for=condition=ready pod -l app=vision-frontend --timeout=60s
	@echo "Cluster is completely deployed! Access the UI at http://localhost:8080"

clean:
	@echo "Tearing down cluster..."
	k3d cluster delete vision-poc

stop:
	@echo "Stopping cluster..."
	k3d cluster stop vision-poc

start:
	@echo "Starting cluster..."
	k3d cluster start vision-poc
