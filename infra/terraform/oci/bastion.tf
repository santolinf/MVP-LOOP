# OCI Bastion: the equivalent of GCP IAP TCP forwarding. Testers authenticate to OCI, create a short-lived managed
# SSH session with their own public key, and forward ports 3000, 9000 and 8025 through it (see tunnel.sh).

resource "oci_bastion_bastion" "dev" {
  compartment_id               = local.compartment_id
  bastion_type                 = "STANDARD"
  name                         = replace("${var.name}bastion", "-", "")
  target_subnet_id             = oci_core_subnet.private.id
  client_cidr_block_allow_list = var.bastion_client_cidrs
  max_session_ttl_in_seconds   = var.bastion_max_session_ttl_seconds
  freeform_tags                = var.freeform_tags
}
