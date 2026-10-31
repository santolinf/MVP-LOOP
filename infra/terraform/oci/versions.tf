terraform {
  required_version = ">= 1.6"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">= 6.0, < 9.0"
    }
  }

  # State is local by default. To share it, use an OCI Object Storage bucket via the S3-compatible backend or the
  # native "oci" backend (Terraform 1.12+); see infra/terraform/README.md.
}

# Resources (network, VM, bastion) live in the target region.
provider "oci" {
  region              = var.region
  config_file_profile = var.oci_config_profile
}

# Identity (compartment, policy) and budgets must be created in the tenancy's home region.
provider "oci" {
  alias               = "home"
  region              = var.home_region
  config_file_profile = var.oci_config_profile
}
