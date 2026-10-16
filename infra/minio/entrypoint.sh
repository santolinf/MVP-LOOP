#!/bin/bash
set -e

# Run background loop to auto-provision initial buckets once MinIO is ready
(
  until mc alias set local http://localhost:9000 "${MINIO_ROOT_USER:-minioadmin}" "${MINIO_ROOT_PASSWORD:-minioadmin}" >/dev/null 2>&1; do
    sleep 1
  done
  mc mb -p local/loop-cv-quarantine local/loop-cv >/dev/null 2>&1 || true
) &

exec minio server /data --console-address ":9001"
