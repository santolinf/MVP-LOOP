output "vm_name" {
  value = google_compute_instance.dev.name
}

output "vm_service_account" {
  value = google_service_account.vm.email
}

output "check_docker_installed" {
  description = "Run a couple of minutes after apply to confirm the startup script finished."
  value       = "gcloud compute ssh ${var.name} --project ${var.project_id} --zone ${var.zone} --tunnel-through-iap -- \"docker --version && docker compose version\""
}

output "ssh_command" {
  description = "SSH in to deploy the app (plan section 7)."
  value       = "gcloud compute ssh ${var.name} --project ${var.project_id} --zone ${var.zone} --tunnel-through-iap"
}

output "tester_tunnel_command" {
  description = "Each tester runs this and keeps it open, then uses http://localhost:3000, /admin/ and http://localhost:8025."
  value       = "gcloud compute ssh ${var.name} --project ${var.project_id} --zone ${var.zone} --tunnel-through-iap -- -N -L 3000:localhost:3000 -L 9000:localhost:9000 -L 8025:localhost:8025"
}

output "direct_access_urls" {
  description = "Option B only: URLs when direct_access_cidrs is set (also set BIND_ADDRESS=0.0.0.0, APP_BASE_URL and S3_PUBLIC_ENDPOINT in .env.vm-dev)."
  value = length(var.direct_access_cidrs) > 0 ? {
    app     = "http://${google_compute_instance.dev.network_interface[0].access_config[0].nat_ip}:3000"
    minio   = "http://${google_compute_instance.dev.network_interface[0].access_config[0].nat_ip}:9000"
    mailpit = "http://${google_compute_instance.dev.network_interface[0].access_config[0].nat_ip}:8025"
  } : null
}

output "stop_command" {
  description = "Stop the VM when nobody is testing (compute charges stop; the disk still bills)."
  value       = "gcloud compute instances stop ${var.name} --project ${var.project_id} --zone ${var.zone}"
}

output "start_command" {
  value = "gcloud compute instances start ${var.name} --project ${var.project_id} --zone ${var.zone}"
}
