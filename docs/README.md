# LOOP documentation

All project documentation lives here, in three categories. `CLAUDE.md` (repository guidance for Claude Code and
contributors) and the short root `README.md` stay at the repository root because tooling expects them there.

## 1. Design and planning: [design-and-planning/](design-and-planning/)

What we are building and why.

| Document | What it is |
| --- | --- |
| [LOOP_V33_Phased_Implementation_Plan.md](design-and-planning/LOOP_V33_Phased_Implementation_Plan.md) | The current phased plan, security decisions (§4), reuse (§6) and open questions (§7). |
| [phases/](design-and-planning/phases/README.md) | One page per phase of the plan. |
| [adr/](design-and-planning/adr/) | Architecture decision records (0001–0013): one platform, auth, uploads and AI, privacy, cloud-agnostic storage/scanning/email, and more. |
| [backlog/](design-and-planning/backlog/) | Work set aside for later. |
| [SESSION_CONTEXT.md](design-and-planning/SESSION_CONTEXT.md) | Hand-off notes for starting a new working session. |

## 2. Local development environment: [local-development/](local-development/README.md)

Running LOOP on a developer machine: dependencies in Docker, commands, tests, and working against a remote Docker host.

## 3. Cloud environment: [cloud-environment/](cloud-environment/)

Developing and testing in the cloud, and deploying.

| Document | What it is |
| --- | --- |
| [gcp-dev-environment.md](cloud-environment/gcp-dev-environment.md) | Plan and provisioning guide for a shared DEV environment on one Google Cloud VM. |
| [infra/terraform/](../infra/terraform/README.md) | Terraform for that DEV VM on Google Cloud (`gcp/`) and an Oracle Cloud equivalent (`oci/`). |
| [deploy-docker.md](cloud-environment/deploy-docker.md) | Deploying the production-style stack on any Docker host. |
| [ci-cd-pipeline.md](cloud-environment/ci-cd-pipeline.md) | CI/CD design: build, deploy, smoke tests, rollback. |
| [deploy-storage-and-scanning.md](cloud-environment/deploy-storage-and-scanning.md) | Object storage and malware-scanner recipes (Google Cloud, AWS, self-hosted). |
| [deploy-email.md](cloud-environment/deploy-email.md) | SMTP provider recipes and the bounce/complaint webhook. |

Requirements and handover material under `requirements/` is local-only (gitignored) and is not part of these docs.
