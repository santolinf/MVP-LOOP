# Inputs for the LOOP shared DEV VM on Google Cloud (docs/cloud-environment/gcp-dev-environment.md).

variable "project_id" {
  description = "Existing Google Cloud project for DEV, with billing linked (plan step 1)."
  type        = string
}

variable "region" {
  description = "Region. London keeps us aligned with the UK-data rule, even for test data."
  type        = string
  default     = "europe-west2"
}

variable "zone" {
  description = "Zone for the VM."
  type        = string
  default     = "europe-west2-a"
}

variable "name" {
  description = "Name of the VM and prefix for the other resources."
  type        = string
  default     = "loop-dev"
}

variable "machine_type" {
  description = "e2-standard-2 (2 vCPU, 8 GB): clamd needs 1-2 GB, the rest of the stack 1-2 GB, plus build headroom. See plan section 4."
  type        = string
  default     = "e2-standard-2"
}

variable "boot_disk_size_gb" {
  description = "Boot disk size. Images, build cache, ClamAV signatures, Postgres and MinIO data. Can be grown later."
  type        = number
  default     = 50
}

variable "boot_image" {
  description = "Boot image. The startup script targets Debian (Docker's Debian apt repository)."
  type        = string
  default     = "debian-cloud/debian-12"
}

variable "subnet_cidr" {
  description = "Range of the dedicated DEV subnet."
  type        = string
  default     = "10.20.0.0/24"
}

variable "testers" {
  description = <<-EOT
    IAM members who may tunnel to the VM (include yourself), e.g. ["user:alice@example.com", "group:loop-testers@example.com"].
    Each gets roles/iap.tunnelResourceAccessor, roles/compute.osLogin and roles/compute.viewer on the project, and
    roles/iam.serviceAccountUser on the VM's service account (plan section 5, option A).
  EOT
  type        = list(string)
  default     = []
}

variable "direct_access_cidrs" {
  description = <<-EOT
    Option B only (less safe): tester IPs allowed to reach ports 3000, 9000 and 8025 directly, e.g. ["203.0.113.7/32"].
    Leave empty for option A (IAP tunnel only). Never use 0.0.0.0/0: Mailpit shows every sign-in code.
  EOT
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for c in var.direct_access_cidrs : c != "0.0.0.0/0" && can(cidrhost(c, 0))])
    error_message = "direct_access_cidrs must be specific CIDR ranges, never 0.0.0.0/0."
  }
}

variable "enable_daily_snapshots" {
  description = "Optional daily snapshot of the boot disk (test data only, so a convenience)."
  type        = bool
  default     = false
}

variable "snapshot_retention_days" {
  description = "How long daily snapshots are kept, when enabled."
  type        = number
  default     = 7
}

variable "billing_account_id" {
  description = "Billing account ID (XXXXXX-XXXXXX-XXXXXX). When set, a monthly budget alert is created for the project. Requires roles/billing.costsManager on the billing account."
  type        = string
  default     = ""
}

variable "budget_amount_gbp" {
  description = "Monthly budget in GBP for the alert. Alerts at 50%, 90% and 100% go to the billing account's admins and users."
  type        = number
  default     = 100
}

variable "labels" {
  description = "Labels applied to resources that support them."
  type        = map(string)
  default = {
    app         = "loop"
    environment = "dev"
    data        = "test-only"
  }
}
