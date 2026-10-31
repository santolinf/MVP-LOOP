#!/usr/bin/env bash
# Open a tunnel to the LOOP DEV VM on OCI through the Bastion service (the OCI counterpart of
#   gcloud compute ssh loop-dev --tunnel-through-iap -- -N -L 3000:... -L 9000:... -L 8025:...).
#
# Usage:  ./tunnel.sh <bastion-ocid> <instance-ocid> [region] [--shell]
#   default: forwards localhost:3000 (site, /admin/), :9000 (MinIO, CV uploads) and :8025 (Mailpit); keep it open.
#   --shell: an interactive shell on the VM instead (to deploy or operate the app).
#
# Needs: the OCI CLI (`oci setup config` done), ssh, and an SSH key pair. Uses ~/.ssh/id_ed25519 unless
# LOOP_SSH_KEY points at another private key (its .pub must sit next to it). Sessions last up to 3 hours; rerun after.
# On Windows, run it from Git Bash or WSL.
set -euo pipefail

BASTION_ID="${1:?bastion OCID required (terraform output bastion_id)}"
INSTANCE_ID="${2:?instance OCID required (terraform output instance_id)}"
REGION="${3:-uk-london-1}"
MODE="${4:-tunnel}"
[[ "$REGION" == "--shell" ]] && { MODE="--shell"; REGION="uk-london-1"; }

KEY="${LOOP_SSH_KEY:-$HOME/.ssh/id_ed25519}"
[[ -f "$KEY" && -f "$KEY.pub" ]] || { echo "SSH key $KEY(.pub) not found. Create one: ssh-keygen -t ed25519" >&2; exit 1; }
TTL="${LOOP_SESSION_TTL:-10800}"

echo "Creating a Bastion session (about a minute)..." >&2
SESSION_ID=$(oci bastion session create-managed-ssh \
  --region "$REGION" \
  --bastion-id "$BASTION_ID" \
  --target-resource-id "$INSTANCE_ID" \
  --target-os-username opc \
  --ssh-public-key-file "$KEY.pub" \
  --session-ttl "$TTL" \
  --display-name "loop-dev-$(whoami)-$(date +%Y%m%d%H%M)" \
  --wait-for-state SUCCEEDED \
  --query 'data.resources[0].identifier' --raw-output)

for _ in $(seq 1 30); do
  STATE=$(oci bastion session get --region "$REGION" --session-id "$SESSION_ID" --query 'data."lifecycle-state"' --raw-output)
  [[ "$STATE" == "ACTIVE" ]] && break
  sleep 5
done
[[ "$STATE" == "ACTIVE" ]] || { echo "Session did not become ACTIVE (state: $STATE)." >&2; exit 1; }

TARGET_IP=$(oci bastion session get --region "$REGION" --session-id "$SESSION_ID" \
  --query 'data."target-resource-details"."target-resource-private-ip-address"' --raw-output)
PROXY="ssh -i $KEY -o StrictHostKeyChecking=accept-new -W %h:%p -p 22 $SESSION_ID@host.bastion.$REGION.oci.oraclecloud.com"

if [[ "$MODE" == "--shell" ]]; then
  exec ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ProxyCommand="$PROXY" -p 22 "opc@$TARGET_IP"
fi

echo "Tunnel open until you press Ctrl+C (or the session expires):" >&2
echo "  http://localhost:3000   site      http://localhost:3000/admin/   admin      http://localhost:8025   Mailpit" >&2
exec ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ProxyCommand="$PROXY" -o ServerAliveInterval=60 -p 22 \
  -N -L 3000:localhost:3000 -L 9000:localhost:9000 -L 8025:localhost:8025 "opc@$TARGET_IP"
