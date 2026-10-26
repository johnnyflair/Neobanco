variable "name" {
  type = string
}

variable "region" {
  type = string
}

variable "rate_limit_per_5min" {
  description = "Peticiones máximas por IP cada 5 minutos antes de bloquear."
  type        = number
  default     = 2000
}
