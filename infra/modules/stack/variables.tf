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

variable "github_repo" {
  type    = string
  default = "johnnyflair/Neobanco" # GitHub compara el nombre exacto, con mayúsculas
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
