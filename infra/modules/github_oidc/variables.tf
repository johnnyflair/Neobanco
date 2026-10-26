variable "name" {
  type = string
}

variable "github_repo" {
  description = "Dueño/repositorio, por ejemplo johnnyflair/neobanco"
  type        = string
}

variable "github_environment" {
  description = "Ambiente de GitHub que puede desplegar (dev, staging o prod)."
  type        = string
}

variable "create_provider" {
  description = "El proveedor OIDC es único por cuenta: crealo solo en el primer ambiente."
  type        = bool
  default     = false
}

variable "policy_arns" {
  type    = list(string)
  default = ["arn:aws:iam::aws:policy/AdministratorAccess"]
}
