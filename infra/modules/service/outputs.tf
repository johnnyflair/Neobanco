output "alb_dns_name" {
  description = "Apuntá el registro DNS de la API (CNAME o alias) a este nombre."
  value       = aws_lb.this.dns_name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "service_name" {
  value = aws_ecs_service.api.name
}

output "migrate_task_family" {
  value = aws_ecs_task_definition.migrate.family
}
