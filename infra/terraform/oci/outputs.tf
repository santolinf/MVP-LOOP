output "compartment_id" {
  value = local.compartment_id
}

output "instance_id" {
  value = oci_core_instance.dev.id
}

output "instance_private_ip" {
  value = oci_core_instance.dev.private_ip
}

output "bastion_id" {
  value = oci_bastion_bastion.dev.id
}

output "tester_tunnel_command" {
  description = "Each tester runs this (needs the OCI CLI configured and an SSH key), keeps it open, then uses http://localhost:3000, /admin/ and http://localhost:8025."
  value       = "./tunnel.sh ${oci_bastion_bastion.dev.id} ${oci_core_instance.dev.id} ${var.region}"
}

output "admin_shell_command" {
  description = "Interactive shell on the VM, to deploy the app (gcp-dev-environment.md section 7; the user is opc)."
  value       = "./tunnel.sh ${oci_bastion_bastion.dev.id} ${oci_core_instance.dev.id} ${var.region} --shell"
}

output "stop_command" {
  description = "Stop the VM when nobody is testing (OCPU and memory charges stop; the boot volume still bills)."
  value       = "oci compute instance action --action SOFTSTOP --instance-id ${oci_core_instance.dev.id} --region ${var.region}"
}

output "start_command" {
  value = "oci compute instance action --action START --instance-id ${oci_core_instance.dev.id} --region ${var.region}"
}
