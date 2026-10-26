variable "name" {
  type = string
}

variable "env" {
  type = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.env)
    error_message = "env debe ser dev, staging o prod."
  }
}

variable "region" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "single_nat" {
  type = bool
}

variable "certificate_arn" {
  type = string
}

variable "image_tag" {
  type = string
}

variable "db_instance_class" {
  type = string
}

variable "redis_node_type" {
  type = string
}

variable "multi_az" {
  type = bool
}

variable "backup_retention_days" {
  type = number
}

variable "deletion_protection" {
  type = bool
}

variable "cpu" {
  type = number
}

variable "memory" {
  type = number
}

variable "min_tasks" {
  type = number
}

variable "max_tasks" {
  type = number
}

variable "alert_emails" {
  type    = list(string)
  default = []
}

# Formato inmutable del claim "sub" de GitHub (repos creados o renombrados desde jul-2026):
# dueño@ID/repo@ID. Si alguien renombra o borra y recrea el repo con el mismo nombre,
# los IDs cambian y ese repo NO puede desplegar. IDs: gh api repos/johnnyflair/Neobanco
variable "github_repo" {
  type    = string
  default = "johnnyflair@89474882/Neobanco@1434597426"
}

variable "create_github_oidc_provider" {
  type    = bool
  default = false
}

variable "dns_zone_name" {
  description = "Zona pública de Route 53 (ej. midominio.com). Vacío = el DNS se apunta a mano."
  type        = string
  default     = ""
}

variable "api_subdomain" {
  description = "Subdominio de la API en esta zona (api-dev, api-staging, api)."
  type        = string
  default     = "api"
}

variable "seed_demo_data" {
  type    = bool
  default = false
}

variable "interface_endpoints" {
  type    = bool
  default = true
}
