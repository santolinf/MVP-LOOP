#!/bin/bash
# First-boot setup for the LOOP DEV VM (Debian 12): Docker Engine + Compose plugin from Docker's apt repository.
# Same script as docs/cloud-environment/gcp-dev-environment.md section 6.3. Runs on every boot; exits early once
# Docker is installed.
set -euxo pipefail
if command -v docker >/dev/null 2>&1; then exit 0; fi
apt-get update
apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
