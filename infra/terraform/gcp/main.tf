# LOOP shared DEV environment on Google Cloud: one Compute Engine VM running Docker, reached only through IAP.
# Mirrors docs/cloud-environment/gcp-dev-environment.md, steps 2-5. The app itself (step 6) is deployed by hand on
# the VM with docker-compose.vm-dev.yml, as that document describes.

# --- Step 2: APIs ----------------------------------------------------------------------------------------------------

locals {
  services = concat(
    ["compute.googleapis.com", "iap.googleapis.com", "oslogin.googleapis.com"],
    var.billing_account_id != "" ? ["billingbudgets.googleapis.com"] : [],
  )
}

resource "google_project_service" "this" {
  for_each = toset(local.services)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# --- Network: a dedicated VPC so we do not depend on the project's default network ---------------------------------

resource "google_compute_network" "dev" {
  name                    = "${var.name}-vpc"
  auto_create_subnetworks = false

  depends_on = [google_project_service.this]
}

resource "google_compute_subnetwork" "dev" {
  name                     = "${var.name}-subnet"
  region                   = var.region
  network                  = google_compute_network.dev.id
  ip_cidr_range            = var.subnet_cidr
  private_ip_google_access = true
}

# --- Step 3: firewall. IAP reaches VMs from 35.235.240.0/20; this is the only inbound rule for option A ------------

resource "google_compute_firewall" "iap_ssh" {
  name          = "${var.name}-allow-iap-ssh"
  network       = google_compute_network.dev.id
  direction     = "INGRESS"
  source_ranges = ["35.235.240.0/20"]
  target_tags   = [var.name]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

# Option B only: direct HTTP from named tester IPs. Created only when direct_access_cidrs is not empty.
resource "google_compute_firewall" "direct" {
  count = length(var.direct_access_cidrs) > 0 ? 1 : 0

  name          = "${var.name}-allow-testers-direct"
  network       = google_compute_network.dev.id
  direction     = "INGRESS"
  source_ranges = var.direct_access_cidrs
  target_tags   = [var.name]

  allow {
    protocol = "tcp"
    ports    = ["3000", "9000", "8025"]
  }
}

# --- Step 4: the VM ------------------------------------------------------------------------------------------------

# Dedicated service account with no roles (better practice than the default Compute account, plan section 6.4).
resource "google_service_account" "vm" {
  account_id   = "${var.name}-vm"
  display_name = "LOOP DEV VM (no roles)"

  depends_on = [google_project_service.this]
}

resource "google_compute_instance" "dev" {
  name         = var.name
  zone         = var.zone
  machine_type = var.machine_type
  tags         = [var.name]
  labels       = var.labels

  allow_stopping_for_update = true

  boot_disk {
    auto_delete = true
    initialize_params {
      image  = var.boot_image
      size   = var.boot_disk_size_gb
      type   = "pd-balanced"
      labels = var.labels
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.dev.id

    # Ephemeral public IP for outbound only (image pulls, apt, freshclam). With no inbound rule except IAP SSH it is
    # not reachable, and it avoids paying for Cloud NAT (plan section 4).
    access_config {}
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  metadata = {
    enable-oslogin = "TRUE"
    startup-script = file("${path.module}/startup.sh")
  }

  service_account {
    email  = google_service_account.vm.email
    scopes = ["cloud-platform"] # the account has no roles, so this grants nothing by itself
  }
}

# Optional daily snapshot of the boot disk.
resource "google_compute_resource_policy" "daily_snapshot" {
  count = var.enable_daily_snapshots ? 1 : 0

  name   = "${var.name}-daily-snapshot"
  region = var.region

  snapshot_schedule_policy {
    schedule {
      daily_schedule {
        days_in_cycle = 1
        start_time    = "03:00"
      }
    }
    retention_policy {
      max_retention_days    = var.snapshot_retention_days
      on_source_disk_delete = "KEEP_AUTO_SNAPSHOTS"
    }
    snapshot_properties {
      storage_locations = [var.region]
      labels            = var.labels
    }
  }
}

resource "google_compute_disk_resource_policy_attachment" "daily_snapshot" {
  count = var.enable_daily_snapshots ? 1 : 0

  name = google_compute_resource_policy.daily_snapshot[0].name
  disk = google_compute_instance.dev.name
  zone = var.zone
}
