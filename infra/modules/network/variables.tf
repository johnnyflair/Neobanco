variable "name" {
  type = string
}

variable "region" {
  type = string
}

variable "cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "single_nat" {
  description = "Un solo NAT (más barato, para dev). En prod, uno por zona."
  type        = bool
  default     = false
}

variable "kms_key_arn" {
  type = string
}
