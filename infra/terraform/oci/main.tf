# LOOP shared DEV environment on OCI: a compartment, a private network with outbound-only internet, one VM running
# Docker, and the OCI Bastion service as the IAP equivalent. The app itself is deployed by hand on the VM with
# docker-compose.vm-dev.yml, exactly as docs/cloud-environment/gcp-dev-environment.md section 7 describes.

locals {
  parent_compartment_id = var.parent_compartment_ocid != "" ? var.parent_compartment_ocid : var.tenancy_ocid
  compartment_id        = oci_identity_compartment.dev.id
}

# --- Compartment: keeps every DEV resource, its permissions and its budget in one place ----------------------------

resource "oci_identity_compartment" "dev" {
  provider = oci.home

  compartment_id = local.parent_compartment_id
  name           = var.name
  description    = "LOOP shared DEV environment (test data only)"
  enable_delete  = true
  freeform_tags  = var.freeform_tags
}

# --- Network: private subnet, NAT for outbound (image pulls, dnf, freshclam), service gateway for OCI services -----

resource "oci_core_vcn" "dev" {
  compartment_id = local.compartment_id
  display_name   = "${var.name}-vcn"
  cidr_blocks    = [var.vcn_cidr]
  dns_label      = "loopdev"
  freeform_tags  = var.freeform_tags
}

resource "oci_core_nat_gateway" "dev" {
  compartment_id = local.compartment_id
  vcn_id         = oci_core_vcn.dev.id
  display_name   = "${var.name}-nat"
  freeform_tags  = var.freeform_tags
}

data "oci_core_services" "all" {
  filter {
    name   = "name"
    values = ["All .* Services In Oracle Services Network"]
    regex  = true
  }
}

resource "oci_core_service_gateway" "dev" {
  compartment_id = local.compartment_id
  vcn_id         = oci_core_vcn.dev.id
  display_name   = "${var.name}-sgw"
  freeform_tags  = var.freeform_tags

  services {
    service_id = data.oci_core_services.all.services[0].id
  }
}

resource "oci_core_route_table" "private" {
  compartment_id = local.compartment_id
  vcn_id         = oci_core_vcn.dev.id
  display_name   = "${var.name}-private-rt"
  freeform_tags  = var.freeform_tags

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_nat_gateway.dev.id
  }

  route_rules {
    destination       = data.oci_core_services.all.services[0].cidr_block
    destination_type  = "SERVICE_CIDR_BLOCK"
    network_entity_id = oci_core_service_gateway.dev.id
  }
}

# The only inbound rule: SSH from inside the VCN, which is where the Bastion's private endpoint sits.
resource "oci_core_security_list" "private" {
  compartment_id = local.compartment_id
  vcn_id         = oci_core_vcn.dev.id
  display_name   = "${var.name}-private-sl"
  freeform_tags  = var.freeform_tags

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  ingress_security_rules {
    source   = var.vcn_cidr
    protocol = "6" # TCP
    tcp_options {
      min = 22
      max = 22
    }
  }
}

resource "oci_core_subnet" "private" {
  compartment_id             = local.compartment_id
  vcn_id                     = oci_core_vcn.dev.id
  display_name               = "${var.name}-private"
  cidr_block                 = var.subnet_cidr
  dns_label                  = "private"
  prohibit_public_ip_on_vnic = true
  route_table_id             = oci_core_route_table.private.id
  security_list_ids          = [oci_core_security_list.private.id]
  freeform_tags              = var.freeform_tags
}

# --- The VM ---------------------------------------------------------------------------------------------------------

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

# Latest Oracle Linux 9 platform image for the shape. Oracle Linux is used because the Bastion plugin of Oracle Cloud
# Agent is supported on it out of the box.
data "oci_core_images" "ol9" {
  compartment_id           = var.tenancy_ocid
  operating_system         = "Oracle Linux"
  operating_system_version = "9"
  shape                    = var.shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"

  filter {
    name   = "display_name"
    values = ["^Oracle-Linux-9\\.[0-9]+-(aarch64-)?[0-9]{4}\\."]
    regex  = true
  }
}

resource "oci_core_instance" "dev" {
  compartment_id      = local.compartment_id
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[var.availability_domain_index].name
  display_name        = var.name
  shape               = var.shape
  freeform_tags       = var.freeform_tags

  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_gb
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ol9.images[0].id
    boot_volume_size_in_gbs = var.boot_volume_size_gb
    boot_volume_vpus_per_gb = 10 # "Balanced", like GCP pd-balanced
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.private.id
    assign_public_ip = false
    hostname_label   = replace(var.name, "-", "")
  }

  agent_config {
    is_management_disabled = false
    is_monitoring_disabled = false

    plugins_config {
      name          = "Bastion"
      desired_state = "ENABLED"
    }
  }

  metadata = merge(
    { user_data = base64encode(file("${path.module}/cloud-init.sh")) },
    var.admin_ssh_public_key != "" ? { ssh_authorized_keys = var.admin_ssh_public_key } : {},
  )

  # A newer platform image must not replace a running DEV box.
  lifecycle {
    ignore_changes = [source_details[0].source_id, metadata]
  }
}
