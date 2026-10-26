terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.70"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
  # Estado remoto cifrado con bloqueo nativo de S3 (ver infra/bootstrap).
  backend "s3" {
    key          = "neobanco/prod/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project     = "neobanco"
      Environment = "prod"
      ManagedBy   = "terraform"
    }
  }
}

module "stack" {
  source                      = "../../modules/stack"
  name                        = "neo-prod"
  env                         = "prod"
  region                      = var.region
  vpc_cidr                    = "10.42.0.0/16"
  single_nat                  = false
  certificate_arn             = var.certificate_arn
  image_tag                   = var.image_tag
  db_instance_class           = "db.r7g.large"
  redis_node_type             = "cache.r7g.large"
  multi_az                    = true
  backup_retention_days       = 35
  deletion_protection         = true
  cpu                         = 1024
  memory                      = 2048
  min_tasks                   = 3
  max_tasks                   = 20
  alert_emails                = var.alert_emails
  create_github_oidc_provider = false
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "certificate_arn" {
  description = "ARN del certificado ACM para el dominio de la API de prod."
  type        = string
}

variable "image_tag" {
  description = "SHA del commit a desplegar (lo pasa el pipeline)."
  type        = string
}

variable "alert_emails" {
  type    = list(string)
  default = []
}

output "alb_dns_name" {
  value = module.stack.alb_dns_name
}

output "ecr_repository_url" {
  value = module.stack.ecr_repository_url
}

output "cluster_name" {
  value = module.stack.cluster_name
}

output "service_name" {
  value = module.stack.service_name
}

output "migrate_task_family" {
  value = module.stack.migrate_task_family
}

output "app_subnet_ids" {
  value = module.stack.app_subnet_ids
}

output "app_security_group_id" {
  value = module.stack.app_security_group_id
}

output "github_deploy_role_arn" {
  value = module.stack.github_deploy_role_arn
}
