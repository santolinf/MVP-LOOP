#!/bin/bash
# First-boot setup for the LOOP DEV VM on OCI (Oracle Linux 9): Docker Engine + Compose plugin from Docker's RHEL
# repository, and the opc user in the docker group. OCI equivalent of the GCP startup.sh. Runs once via cloud-init.
set -euxo pipefail
if command -v docker >/dev/null 2>&1; then exit 0; fi
dnf -y install dnf-plugins-core git
# Docker's containerd.io conflicts with the distro runc / podman-docker if present.
dnf -y remove runc podman-docker || true
dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
usermod -aG docker opc
