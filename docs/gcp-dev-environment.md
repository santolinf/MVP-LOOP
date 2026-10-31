# LOOP DEV environment on Google Cloud: summary, plan and provisioning

Purpose: one shared DEV environment on a single Compute Engine VM so Richard can start manual testing of the LOOP
contractor journey. The VM runs Docker, and Docker runs the app and every service it depends on.

Status: **plan, not yet provisioned.** The compose file and env template referenced here are new and have been
validated for syntax only (`docker compose config`); the full stack has not yet been brought up on a VM. Section 9
lists what to verify first.

---

## 1. What we discussed and agreed

### Decisions

| # | Topic | Decision | Where recorded |
|---|-------|----------|----------------|
| 1 | Malware scanning, why | A CV is a file from a stranger. The scan protects whoever opens it later (admins, and agencies once agency access is live), not the app itself. | [ADR 0005](adr/0005-uploads-and-ai.md), [0012](adr/0012-cloud-agnostic-storage-and-scanning.md) |
| 2 | Scan timing | Scan at **ingestion, before** text extraction and the AI. The AI only sees extracted text, so it cannot be "infected"; the extractor can be attacked, so it never sees an unscanned file. Stored files are also re-scanned periodically. | ADR 0012 |
| 3 | Managed vs self-hosted scanning | Google Cloud has **no managed equivalent** of AWS GuardDuty for S3; its own pattern is ClamAV on Cloud Run. So scanning is **self-hosted ClamAV** either way. | ADR 0012 |
| 4 | Cloud-agnostic principle | The app depends on **interfaces, not cloud products**: the S3 API for storage, a `POST /scan` HTTP contract for scanning, SMTP plus a neutral webhook for email. Provider specifics live only in `infra/` and deploy docs. | CLAUDE.md rule 14, ADRs 0012, 0013 |
| 5 | Storage | S3-compatible API. MinIO in dev; on Google Cloud production, Cloud Storage (GCS) via its S3 interoperability API. Azure Blob is not S3-compatible and is out of scope without a gateway. | ADR 0012 |
| 6 | Scanner hosting | One container image (`infra/clamav-scanner`: clamd + freshclam + a small HTTP front) that runs on any container platform. Cloud Run or Fargate in production; a plain container on this DEV VM. | ADR 0012, [deploy-storage-and-scanning.md](deploy-storage-and-scanning.md) |
| 7 | Email | SMTP submission with TLS and credentials required in production; bounces and complaints via a neutral `POST /webhooks/email`. Mailpit in dev. | ADR 0013, [deploy-email.md](deploy-email.md) |
| 8 | Email provider | Undecided (Open Question 4). **Postmark is interim** for dev/test/staging; the provider must be decided, contracted and UK/EU-reviewed **before any real contractor is invited**. | ADR 0013 |
| 9 | Bug found by testing against real MinIO | Presigned uploads did not sign the content type, so any type was accepted. Fixed. | `storage.service.ts` |

### Built so far (all uncommitted in the working tree on `feature/web-sign-in`)

- Scanner client now speaks the HTTP contract; raw-TCP clamd client removed; dev compose runs the same scanner image.
- Storage conformance suite and scanner contract suite (the "definition of supported" for any backend).
- Hourly CV re-scan job (`cv-rescan`) with a `lastScannedAt` migration; infected files are deleted, the upload is
  rejected and a SYSTEM audit event is written.
- AWS CDK `LoopScanner` stack (Fargate + internal HTTPS ALB), deployed only when a certificate ARN is supplied. It has
  not been deployed.
- Production-grade SMTP sender (nodemailer, new dependency), production refuses plain-text or credential-less SMTP.
- Provider-neutral webhook events, with the Postmark adapter on top.
- `S3_PUBLIC_ENDPOINT`: the host baked into presigned URLs can differ from the one the API uses (needed on this VM,
  see section 3).

### Still open

- Email provider choice (OQ4) and its webhook adapter, before go-live.
- Re-scan at agency download (no agency download path exists yet).
- Google Cloud **production** architecture is not decided. The remaining CDK stacks (data, storage, service, secrets,
  monitoring) are stubs and describe AWS.
- Real LLM extraction is not wired: the provider is a mock, so every CV lands in "enter your details manually".
- Real STARTTLS/AUTH and real-provider behaviour are untested.

---

## 2. What the DEV environment is, and is not

**Is:** an always-available, shared, disposable environment running the real app build with test data.

**Is not:** production. It deliberately runs with `NODE_ENV=development` because production mode refuses what a
self-contained dev box uses: a plain-HTTP scanner, plain-text SMTP (Mailpit), and it sets Secure-only cookies that need
HTTPS. Consequences Richard should know:

- All email goes to **Mailpit** on the VM; nothing is delivered to real inboxes. Sign-in codes are read there.
- CVs are stored in **MinIO** on the VM disk. The scanner is the real ClamAV image.
- **Test data only.** No real contractor data, ever, in this environment.
- AI CV extraction is a mock. Manual entry is the path to test.

---

## 3. Architecture on the VM

```
Richard's browser
   │  (SSH tunnel over IAP, see section 5)
   ▼  localhost:3000 / :9000 / :8025
┌─────────────────────── GCE VM  loop-dev  (europe-west2-a) ───────────────────────┐
│ Docker                                                                            │
│   app            :3000  web + admin + API + background worker (APP_ROLE=all)      │
│   postgres       :5432  (internal only)                                           │
│   migrate               one-shot, applies Prisma migrations, then exits           │
│   minio          :9000  S3-compatible storage for CVs                             │
│   clamav-scanner :8080  POST /scan (internal only)                                │
│   mailpit        :8025  web UI for all outgoing email; :1025 SMTP (internal)      │
└───────────────────────────────────────────────────────────────────────────────────┘
```

Why three ports are reached by the browser: the web app (3000), Mailpit's UI (8025) and **MinIO (9000)**. The browser
uploads and downloads CVs directly with presigned URLs, and those URLs contain a host. The API reaches MinIO as
`http://minio:9000` (inside Docker), which a browser cannot resolve, so `S3_PUBLIC_ENDPOINT` makes the API put the
browser-reachable address (`http://localhost:9000` through the tunnel) into the URLs instead.

The compose file is [docker-compose.vm-dev.yml](../docker-compose.vm-dev.yml); its env template is
[.env.vm-dev.example](../.env.vm-dev.example).

---

## 4. Sizing

| Item | Recommendation | Reason |
|------|----------------|--------|
| Region / zone | `europe-west2` (London), zone `europe-west2-a` | Matches the UK-data rule, even though dev holds only test data. |
| Machine type | **`e2-standard-2`**: 2 vCPU, 8 GB RAM | The scanner (clamd) alone holds about 1–2 GB resident; Postgres, MinIO, Mailpit and the Node app take roughly 1–2 GB more; the image build (pnpm install + Vite + Nest) wants headroom. 4 GB (`e2-medium`) would be tight and swap-prone. |
| Boot disk | **50 GB `pd-balanced`** | Docker images and build cache (several GB), ClamAV signatures, Postgres, MinIO objects, logs. Can be grown later without rebuilding. |
| OS | Debian 12 (`debian-12`) or Ubuntu 24.04 LTS | Both are fine; Debian is lean. The steps below use Debian. |
| External IP | Ephemeral, **no inbound firewall rule except IAP SSH** | Outbound access is needed (image pulls, `apt`, ClamAV signature updates). With no inbound rules the public IP is not reachable. Avoids paying for Cloud NAT. |

Expect the first `docker compose up --build` on 2 vCPU to take on the order of 10–20 minutes (estimate, not
measured). Cost: check the [Pricing Calculator](https://cloud.google.com/products/calculator) for `e2-standard-2` plus
50 GB `pd-balanced` in `europe-west2`. **Stop the VM when nobody is testing**: compute charges stop, the disk still
bills.

---

## 5. How Richard reaches it

### Option A (recommended): SSH tunnel through IAP, no public exposure

Nothing is open to the internet. Richard authenticates with his Google account and forwards three ports to his own
machine:

```bash
gcloud compute ssh loop-dev --zone europe-west2-a --tunnel-through-iap -- -N \
  -L 3000:localhost:3000 -L 9000:localhost:9000 -L 8025:localhost:8025
```

Then he uses `http://localhost:3000` (site), `http://localhost:3000/admin/` (admin) and `http://localhost:8025`
(Mailpit). Keep the command running while testing. With this option:

- `.env.vm-dev`: `BIND_ADDRESS=127.0.0.1`, `APP_BASE_URL=http://localhost:3000`, `S3_PUBLIC_ENDPOINT=http://localhost:9000`.
- Richard needs the Google Cloud CLI installed and these IAM roles on the project (or just this VM):
  `roles/iap.tunnelResourceAccessor`, `roles/compute.osLogin`, `roles/compute.viewer`, and
  `roles/iam.serviceAccountUser` on the VM's service account (OS Login requires it when a service account is attached).
- Because `http://localhost` is treated as a secure context, no TLS is needed for the cookies to work.

### Option B: direct access from a fixed IP (simpler for Richard, less safe)

Open ports 3000, 9000 and 8025 to **Richard's IP address only** and bind to all interfaces
(`BIND_ADDRESS=0.0.0.0`, `APP_BASE_URL=http://<VM external IP>:3000`, `S3_PUBLIC_ENDPOINT=http://<VM external IP>:9000`).
This is plain HTTP, and Mailpit shows every sign-in code to anyone who can reach it, so the allow-list is the only
protection. Only use it if Richard cannot install `gcloud`, and never open these ports to `0.0.0.0/0`.

### Later, not now

A DNS name with a TLS reverse proxy (Caddy) in front, if a friendlier URL is wanted. Out of scope for the first
iteration.

---

## 6. Provisioning plan

Estimated effort: about half a day for someone comfortable with `gcloud`, mostly waiting for builds. Steps marked
(you) need your Google Cloud permissions.

| Step | Who | What | Done when |
|------|-----|------|-----------|
| 1 | you | Choose or create a **project** for dev, link billing, set a **budget alert** | Project exists, alert set |
| 2 | you | Enable APIs: Compute Engine, IAP | `gcloud services list` shows them |
| 3 | you | Create the firewall rule for IAP SSH (below) | Rule exists |
| 4 | you | Create the VM from the startup script (below) | VM is `RUNNING`, Docker installed |
| 5 | you | Grant Richard (and yourself) the IAM roles in section 5 | `gcloud compute ssh` works for him |
| 6 | you | On the VM: clone the repo, create `.env.vm-dev`, bring the stack up, seed | Section 7 |
| 7 | you + Richard | Run the checks in section 8 | All pass |
| 8 | Richard | Manual testing | |

Set once: `PROJECT=<your-project-id>` and `ZONE=europe-west2-a`.

### 6.1 Project and APIs (steps 1–2)

```bash
gcloud config set project $PROJECT
gcloud services enable compute.googleapis.com iap.googleapis.com
```

### 6.2 Firewall: SSH from IAP only (step 3)

IAP reaches VMs from the range `35.235.240.0/20`. This is the only inbound rule needed for Option A.

```bash
gcloud compute firewall-rules create loop-dev-allow-iap-ssh \
  --network=default --direction=INGRESS --action=allow --rules=tcp:22 \
  --source-ranges=35.235.240.0/20 --target-tags=loop-dev
```

(If the project's `default` network has been deleted, create a VPC and subnet in `europe-west2` first and change
`--network`.) For Option B, also add a rule allowing `tcp:3000,9000,8025` from Richard's IP only.

### 6.3 VM with Docker installed (step 4)

Save as `startup.sh`. It installs Docker Engine and the Compose plugin from Docker's apt repository on first boot.

```bash
#!/bin/bash
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
```

```bash
gcloud compute instances create loop-dev \
  --zone=$ZONE --machine-type=e2-standard-2 \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=50GB --boot-disk-type=pd-balanced \
  --tags=loop-dev \
  --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring \
  --metadata=enable-oslogin=TRUE \
  --metadata-from-file=startup-script=startup.sh
```

Wait a couple of minutes, then check the script finished:

```bash
gcloud compute ssh loop-dev --zone $ZONE --tunnel-through-iap -- "docker --version && docker compose version"
```

Optional: a daily disk snapshot schedule (Compute Engine, Snapshots) if losing the dev database would hurt. It holds
test data only, so this is a convenience.

### 6.4 IAM for Richard (step 5)

```bash
gcloud projects add-iam-policy-binding $PROJECT --member=user:richard@example.com --role=roles/iap.tunnelResourceAccessor
gcloud projects add-iam-policy-binding $PROJECT --member=user:richard@example.com --role=roles/compute.osLogin
gcloud projects add-iam-policy-binding $PROJECT --member=user:richard@example.com --role=roles/compute.viewer
```

Also `roles/iam.serviceAccountUser` on the VM's service account (the default Compute service account unless you
created a dedicated one; a dedicated service account with no roles is better practice). Replace the example address.

---

## 7. Deploy the app on the VM (step 6)

SSH in:

```bash
gcloud compute ssh loop-dev --zone $ZONE --tunnel-through-iap
```

Then on the VM:

```bash
# Add your user to the docker group once, then log out and in again
sudo usermod -aG docker $USER

# Get the code. Use a read-only deploy key or a fine-grained token for a private repo; never paste a token into a file
# that is committed, and do not leave it in shell history.
git clone <repo-url> loop && cd loop
git checkout <branch-to-test>

# Configure
cp .env.vm-dev.example .env.vm-dev
for v in POSTGRES_PASSWORD SESSION_SECRET JWT_SECRET S3_SECRET_ACCESS_KEY CLAMAV_AUTH_TOKEN; do
  sed -i "s|^$v=.*|$v=$(openssl rand -hex 32)|" .env.vm-dev
done
sed -i "s|^S3_ACCESS_KEY_ID=.*|S3_ACCESS_KEY_ID=$(openssl rand -hex 12)|" .env.vm-dev
# Option A needs no further edits; for Option B set BIND_ADDRESS, APP_BASE_URL and S3_PUBLIC_ENDPOINT as in section 5.

# Build and start (first run is slow)
docker compose -f docker-compose.vm-dev.yml --env-file .env.vm-dev up -d --build
docker compose -f docker-compose.vm-dev.yml --env-file .env.vm-dev ps -a
```

`migrate` should show `Exited (0)` and `app` should become healthy. The scanner takes a minute or two to download
signatures; `app` waits for it.

### Seed reference data (once)

The app needs its feature flags, reminder configuration and founding counter, and the admin portal needs a first admin.
The runtime image does not contain the seed tooling, but the `migrate` image does:

```bash
docker compose -f docker-compose.vm-dev.yml --env-file .env.vm-dev run --rm --no-deps \
  -e NODE_ENV=development -e ADMIN_BOOTSTRAP_EMAIL=richard@example.com \
  --entrypoint "" migrate pnpm --filter @loop/db seed
```

This also creates a test contractor (`+447700900001`). Payouts, profit-sharing and agency flags stay **off**; do not
enable them. The seed command is untested on the VM, so see section 9.

---

## 8. Verification checklist (do before handing over)

Run through the tunnel (Option A). Tick each:

1. `curl http://localhost:3000/api/v1/health` returns `{"status":"ok"}`.
2. On the VM, the scanner is ready (it is not published, so ask it from inside the app container):
   `docker compose -f docker-compose.vm-dev.yml --env-file .env.vm-dev exec app node -e "fetch('http://clamav-scanner:8080/healthz').then(r=>console.log(r.status))"`
   prints `200`.
3. Open `http://localhost:3000/`, start the join journey, request a sign-in code; the email appears in Mailpit at
   `http://localhost:8025` and the code works.
4. Upload a small PDF CV: it is accepted and reaches the next step (proves MinIO, presigned URLs, the scanner and the
   promote step end to end).
5. Upload the **EICAR** antivirus test file as a `.pdf`-named file: it must be rejected with the generic message. Use
   the standard 68-character EICAR string from eicar.org, which is harmless but triggers every scanner. (A real PDF
   header check may reject it first as a type mismatch; to exercise the scanner itself, embed the string inside an
   otherwise valid PDF.)
6. `http://localhost:3000/admin/`: sign in as the bootstrap admin with an emailed code (read it in Mailpit) and enrol
   an authenticator app.
7. Reboot the VM (`sudo reboot`) and confirm everything comes back (`restart: unless-stopped`).

---

## 9. Things that are unverified, to check first

| Item | Why it matters |
|------|----------------|
| Full stack never run on a VM from `docker-compose.vm-dev.yml` | Only syntax-validated. Expect minor fixes. |
| Seed command via the `migrate` image | Assumes the build stage contains the seed script and `tsx`. If it fails, run the seed from a workstation against a port-forwarded Postgres, or add a `seed` target to the Dockerfile. |
| MinIO and scanner images build on the VM | MinIO builds from source with `go install ...@latest` (slow, unpinned); pin it if it breaks. |
| Presigned URLs through the tunnel | The design (section 3) is unit-tested but not exercised end to end through IAP. |
| Browser upload CORS to MinIO (`:9000` from `:3000`) | Works in the local dev setup, same origins pattern, but confirm on the VM. |
| Debian 12 startup script | Written from Docker's published instructions, not run. |
| Docker image build time and memory on 2 vCPU | If the build runs out of memory, build on a workstation or in CI and push images to Artifact Registry instead. |

---

## 10. Operating the environment

| Task | Command (on the VM, in the repo directory) |
|------|--------------------------------------------|
| Update to a new build | `git pull && docker compose -f docker-compose.vm-dev.yml --env-file .env.vm-dev up -d --build` (migrations run first) |
| Logs | `docker compose -f docker-compose.vm-dev.yml --env-file .env.vm-dev logs -f app` |
| Status | `docker compose -f docker-compose.vm-dev.yml --env-file .env.vm-dev ps -a` |
| Back up the database | `docker compose ... exec postgres pg_dump -U loop loop > loop.sql` |
| Reset to clean (deletes data) | `docker compose ... down -v` then `up -d --build` and re-seed |
| Reclaim disk | `docker image prune -f` (and check `df -h`) |
| Save money | Stop the VM when idle: `gcloud compute instances stop loop-dev --zone $ZONE`; start it again with `start`. The tunnel address stays `localhost`, so nothing changes for Richard. |

Caveat: `POSTGRES_PASSWORD` is only read when the database volume is first created. Changing it later requires
`down -v` (which deletes the data) or changing the password inside Postgres.

---

## 11. Security and data rules for this environment

- **Test data only.** Real contractor data must never enter it (UK-data and consent rules; the email provider is not yet
  chosen or contracted).
- No inbound access except IAP SSH (Option A) or an explicit single-IP allow-list (Option B). Postgres and the
  scanner are never published.
- Mailpit holds every sign-in code: treat access to port 8025 as access to every account.
- Secrets live only in `.env.vm-dev` on the VM (gitignored). Rotate by editing the file and running `up -d`.
- OS Login (IAM) controls SSH; do not add shared SSH keys.
- Feature flags for payouts, profit sharing and agency access stay off.
- The VM is disposable: anything important belongs in git or in a snapshot you chose to take.

---

## 12. After DEV: what this does not decide

This VM is a **dev** convenience. It does not decide the production design. Open items that remain, in rough order:

1. Email provider and its webhook adapter (before any real contractor).
2. Google Cloud (or AWS) production topology: Cloud Run / GKE / VM, Cloud SQL, Cloud Storage via S3 interop,
   scanner on Cloud Run, Secret Manager. Only the AWS scanner stack exists today, and it is undeployed.
3. A staging environment that runs `NODE_ENV=production` over HTTPS so production-only behaviour (Secure cookies,
   TLS-only SMTP, https scanner) is exercised before release.
4. Real LLM extraction.
5. Re-scan at agency download, before `agency.access` is turned on.
