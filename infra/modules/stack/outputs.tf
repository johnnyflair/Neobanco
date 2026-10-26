output "alb_dns_name" {
  value = module.api.alb_dns_name
}

output "ecr_repository_url" {
  value = module.api.ecr_repository_url
}

output "cluster_name" {
  value = module.api.cluster_name
}

output "service_name" {
  value = module.api.service_name
}

output "migrate_task_family" {
  value = module.api.migrate_task_family
}

output "app_subnet_ids" {
  value = module.network.app_subnet_ids
}

output "app_security_group_id" {
  value = aws_security_group.app.id
}

output "github_deploy_role_arn" {
  value = module.github.role_arn
}

output "api_url" {
  description = "URL pública de la API (vacía si el DNS se apunta a mano)."
  value       = var.dns_zone_name == "" ? "" : "https://${var.api_subdomain}.${var.dns_zone_name}"
}
