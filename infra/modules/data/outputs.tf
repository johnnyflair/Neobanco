output "db_address" {
  value = aws_db_instance.this.address
}

output "db_master_secret_arn" {
  description = "Secreto con usuario y contraseña maestros (rotados por RDS)."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "redis_url_secret_arn" {
  value = aws_secretsmanager_secret.redis_url.arn
}
