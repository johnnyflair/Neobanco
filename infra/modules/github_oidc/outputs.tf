output "role_arn" {
  description = "Guardalo en GitHub como variable AWS_DEPLOY_ROLE_ARN del ambiente."
  value       = aws_iam_role.deploy.arn
}
