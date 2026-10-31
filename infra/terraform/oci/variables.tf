# Inputs for the LOOP shared DEV VM on Oracle Cloud Infrastructure: the OCI equivalent of
# docs/cloud-environment/gcp-dev-environment.md (one VM running Docker, no inbound access except a managed tunnel).

variable "tenancy_ocid" {
  description = "Tenancy OCID (from ~/.oci/config)."
  type        = string
}

variable "oci_config_profile" {
  description = "Profile in ~/.oci/config used for authentication."
  type        = string
  default     = "DEFAULT"
}

variable "region" {
  description = "Region for the VM. uk-london-1 keeps us aligned with the UK-data rule."
  type        = string
  default     = "uk-london-1"
}

variable "home_region" {
  description = "Tenancy home region (identity and budgets are created there). Shown in the console under Tenancy details."
  type        = string
  default     = "uk-london-1"
}

variable "parent_compartment_ocid" {
  description = "Compartment under which the loop-dev compartment is created. Empty = the tenancy root."
  type        = string
  default     = ""
}

variable "name" {
  description = "Name of the VM, compartment and prefix for the other resources."
  type        = string
  default     = "loop-dev"
}

variable "shape" {
  description = <<-EOT
    Compute shape. VM.Standard.E5.Flex (AMD x86) matches the GCP sizing. VM.Standard.A1.Flex (Ampere ARM) is cheaper
    and partly free-tier, but the LOOP images (ClamAV, MinIO, app) have not been tested on ARM.
  EOT
  type        = string
  default     = "VM.Standard.E5.Flex"
}

variable "ocpus" {
  description = "OCPUs. On x86 one OCPU = 2 vCPUs, so 1 OCPU matches GCP e2-standard-2."
  type        = number
  default     = 1
}

variable "memory_gb" {
  description = "Memory in GB (clamd needs 1-2 GB, the rest of the stack 1-2 GB, plus build headroom)."
  type        = number
  default     = 8
}

variable "boot_volume_size_gb" {
  description = "Boot volume size in GB."
  type        = number
  default     = 50
}

variable "availability_domain_index" {
  description = "Which availability domain to use (0-based). London has one."
  type        = number
  default     = 0
}

variable "vcn_cidr" {
  description = "VCN range."
  type        = string
  default     = "10.20.0.0/16"
}

variable "subnet_cidr" {
  description = "Private subnet range for the VM and the bastion's endpoint."
  type        = string
  default     = "10.20.1.0/24"
}

variable "bastion_client_cidrs" {
  description = <<-EOT
    Public IP ranges allowed to open sessions through the Bastion. Sessions also require an OCI login with the policy
    below and the matching SSH private key, so 0.0.0.0/0 is the common default; narrow it to office/home IPs if you can.
  EOT
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "bastion_max_session_ttl_seconds" {
  description = "Longest a tester's session may last (OCI maximum is 10800 = 3 hours)."
  type        = number
  default     = 10800

  validation {
    condition     = var.bastion_max_session_ttl_seconds >= 1800 && var.bastion_max_session_ttl_seconds <= 10800
    error_message = "Must be between 1800 and 10800 seconds."
  }
}

variable "tester_group" {
  description = <<-EOT
    Existing IAM group of testers (include yourself), in policy syntax. For identity-domain tenancies:
    "'Default'/'loop-dev-testers'". Empty = no tester policy (only administrators can open sessions).
  EOT
  type        = string
  default     = ""
}

variable "admin_ssh_public_key" {
  description = "Optional public key added to the opc user, for break-glass access. Bastion sessions do not need it."
  type        = string
  default     = ""
}

variable "budget_amount" {
  description = "Monthly budget for the compartment, in the tenancy's currency. 0 = no budget."
  type        = number
  default     = 100
}

variable "budget_alert_emails" {
  description = "Recipients of budget alerts (at 50%, 90% and 100%)."
  type        = list(string)
  default     = []
}

variable "freeform_tags" {
  description = "Tags applied to resources."
  type        = map(string)
  default = {
    app         = "loop"
    environment = "dev"
    data        = "test-only"
  }
}
