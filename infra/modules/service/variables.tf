variable "name" {
  type = string
}

variable "env" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "app_subnet_ids" {
  type = list(string)
}

variable "app_security_group_id" {
  type = string
}

variable "kms_key_arn" {
  type = string
}

variable "waf_arn" {
  type = string
}

variable "certificate_arn" {
  description = "Certificado ACM del dominio de la API (por ejemplo api.neobanco.app)."
  type        = string
}

variable "db_address" {
  type = string
}

variable "db_secret_arn" {
  type = string
}

variable "redis_url_secret_arn" {
  type = string
}

variable "image_tag" {
  description = "Etiqueta de la imagen (SHA del commit). La pone el pipeline."
  type        = string
}

variable "cpu" {
  type    = number
  default = 512
}

variable "memory" {
  type    = number
  default = 1024
}

variable "min_tasks" {
  type    = number
  default = 2
}

variable "max_tasks" {
  type    = number
  default = 10
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "alert_emails" {
  type    = list(string)
  default = []
}
