# Tester access: the OCI counterpart of the GCP roles iap.tunnelResourceAccessor + compute.osLogin + compute.viewer.
# Limited to the loop-dev compartment. Created only when tester_group is set; group membership is managed in the
# console (Identity > Domains > Default > Groups), not here.

resource "oci_identity_policy" "testers" {
  count    = var.tester_group != "" ? 1 : 0
  provider = oci.home

  compartment_id = local.parent_compartment_id
  name           = "${var.name}-testers"
  description    = "Lets LOOP DEV testers open Bastion sessions to the DEV VM"
  freeform_tags  = var.freeform_tags

  statements = [
    "Allow group ${var.tester_group} to use bastion in compartment id ${local.compartment_id}",
    "Allow group ${var.tester_group} to manage bastion-session in compartment id ${local.compartment_id}",
    "Allow group ${var.tester_group} to read instance-family in compartment id ${local.compartment_id}",
    "Allow group ${var.tester_group} to read instance-agent-plugins in compartment id ${local.compartment_id}",
    "Allow group ${var.tester_group} to read virtual-network-family in compartment id ${local.compartment_id}",
    "Allow group ${var.tester_group} to inspect work-requests in compartment id ${local.compartment_id}",
  ]
}
