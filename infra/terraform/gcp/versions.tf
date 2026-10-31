terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.0, < 8.0"
    }
  }

  # State is local by default (fine for one person). To share it, create a GCS bucket in europe-west2 and uncomment:
  # backend "gcs" {
  #   bucket = "<your-tf-state-bucket>"
  #   prefix = "loop/dev"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone

  # The Billing Budgets API needs a quota project when called with user credentials.
  billing_project       = var.project_id
  user_project_override = true
}
