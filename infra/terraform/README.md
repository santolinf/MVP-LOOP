# Terraform: LOOP shared DEV environment

Terraform for the single-VM DEV environment described in
[docs/cloud-environment/gcp-dev-environment.md](../../docs/cloud-environment/gcp-dev-environment.md), for two clouds:

| Folder | Cloud | Tunnel for testers | Status |
| --- | --- | --- | --- |
| [gcp/](gcp/) | Google Cloud, `europe-west2` | IAP TCP forwarding + OS Login | The agreed plan (steps 2–5 of section 6) |
| [oci/](oci/) | Oracle Cloud, `uk-london-1` | OCI Bastion managed SSH sessions | Equivalent, for comparison |

Both create **infrastructure only**: network, firewall, a VM with Docker installed on first boot, tester access and a
budget alert. Deploying the app on the VM (clone, `.env.vm-dev`, `docker compose up`, seed) stays a manual step,
section 7 of the plan, because it needs repository credentials and generated secrets that must not live in Terraform
state. The app is unchanged on either cloud (CLAUDE.md rule 14).

**Status:** `gcp/` passes `terraform fmt` and `terraform validate` and has been applied to the DEV project (the VM,
network, firewall and tester access exist in state). `oci/` is still unapplied: run `terraform init`, `terraform
validate` and `terraform plan` before its first `apply` and expect small fixes (see "Unverified" below). Application
changes do not need a Terraform run; they are deployed with docker compose on the VM.

## What maps to what

| Concern | Google Cloud (`gcp/`) | Oracle Cloud (`oci/`) |
| --- | --- | --- |
| Isolation | Existing project you supply | New `loop-dev` compartment |
| Network | Dedicated VPC + subnet; ephemeral public IP for outbound only | VCN + private subnet; NAT gateway (outbound) + service gateway |
| Inbound | `tcp:22` from IAP range `35.235.240.0/20` only | `tcp:22` from inside the VCN only (Bastion endpoint) |
| VM | `e2-standard-2` (2 vCPU, 8 GB), Debian 12, 50 GB `pd-balanced`, Shielded VM | `VM.Standard.E5.Flex` 1 OCPU (= 2 vCPU), 8 GB, Oracle Linux 9, 50 GB balanced |
| Docker install | `gcp/startup.sh` (startup-script metadata) | `oci/cloud-init.sh` (cloud-init user data) |
| Tester access | Roles `iap.tunnelResourceAccessor`, `compute.osLogin`, `compute.viewer` + `serviceAccountUser` on the VM SA | Policy for an existing group: `use bastion`, `manage bastion-session`, read instance / plugins / network |
| Login on the VM | Each tester's own OS Login account | Shared `opc` user; each session carries the tester's own key |
| Session length | Unlimited | Up to 3 hours, then rerun `tunnel.sh` |
| Budget | `google_billing_budget` (optional, needs billing account) | `oci_budget_budget` on the compartment |
| Option B (direct IP allow-list) | `direct_access_cidrs` | Not provided (use the Bastion) |

## Google Cloud

Prerequisites: Terraform ≥ 1.6, `gcloud auth application-default login`, a project with billing linked, and Owner
(or Compute Admin + IAM Admin + Service Usage Admin) on it. For the budget, `roles/billing.costsManager` on the
billing account.

```bash
cd infra/terraform/gcp
cp terraform.tfvars.example terraform.tfvars    # set project_id, testers, optionally billing_account_id
terraform init
terraform validate
terraform plan
terraform apply
terraform output check_docker_installed          # run the printed command after ~2 minutes
```

Then follow plan section 7 (deploy the app) using `terraform output ssh_command`, and section 8 (checks). Testers use
`terraform output tester_tunnel_command`. The budget currency must match the billing account (GBP is assumed).

## Oracle Cloud

Prerequisites: Terraform ≥ 1.6, the OCI CLI configured (`oci setup config`; Terraform reads `~/.oci/config`), and an
administrator able to create compartments and policies. Create the tester group first in the console (Identity &
Security → Domains → Default → Groups, e.g. `loop-dev-testers`) and add people, including yourself.

```bash
cd infra/terraform/oci
cp terraform.tfvars.example terraform.tfvars    # set tenancy_ocid, home_region, tester_group, budget emails
terraform init
terraform validate
terraform plan
terraform apply
```

A freshly created compartment can take a minute to be visible to other services; if the first apply fails with
`NotAuthorizedOrNotFound` on the VCN, run `terraform apply` again.

Deploy the app: `terraform output admin_shell_command` opens a shell on the VM as `opc` (already in the `docker`
group), then follow plan section 7 from `git clone`. Testers run `terraform output tester_tunnel_command` from Git Bash,
WSL, macOS or Linux; it needs the OCI CLI and an SSH key (`ssh-keygen -t ed25519`). Each session lasts up to 3 hours.

## Daily operation

Stop the VM when nobody is testing (compute charges stop, the disk still bills): `terraform output stop_command` /
`start_command`. Nothing changes for testers, who always use `localhost`. `terraform destroy` removes everything,
including the VM's data.

## Unverified, check first

| Item | Why it matters |
| --- | --- |
| Neither stack has been validated or applied | Terraform could not be installed where these were written; run `terraform validate` first. |
| Oracle Linux 9 + Docker's RHEL repository | The usual route on OL9, not yet run here. If `dnf` reports conflicts, remove the conflicting package and rerun `cloud-init.sh`. |
| SELinux on Oracle Linux | The compose file uses named volumes, which work under SELinux; bind mounts would need `:z`. |
| ARM (`VM.Standard.A1.Flex`) | Cheaper, but the scanner, MinIO and app images are untested on arm64. Keep x86 unless you test it. |
| `tunnel.sh` on Windows | Written for bash; run it from Git Bash or WSL. |
| Everything in section 9 of the plan | The app-level unknowns (first compose run, seed, presigned URLs through the tunnel) apply to both clouds. |
