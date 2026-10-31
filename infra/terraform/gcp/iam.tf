# --- Step 5: tester access (plan section 5, option A) ---------------------------------------------------------------

locals {
  tester_project_roles = [
    "roles/iap.tunnelResourceAccessor",
    "roles/compute.osLogin",
    "roles/compute.viewer",
  ]

  tester_bindings = {
    for pair in setproduct(var.testers, local.tester_project_roles) :
    "${pair[0]}|${pair[1]}" => { member = pair[0], role = pair[1] }
  }
}

resource "google_project_iam_member" "testers" {
  for_each = local.tester_bindings

  project = var.project_id
  role    = each.value.role
  member  = each.value.member
}

# OS Login requires serviceAccountUser on the VM's service account when one is attached.
resource "google_service_account_iam_member" "testers_sa_user" {
  for_each = toset(var.testers)

  service_account_id = google_service_account.vm.name
  role               = "roles/iam.serviceAccountUser"
  member             = each.value
}
