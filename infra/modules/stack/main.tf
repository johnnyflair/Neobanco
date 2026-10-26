# Composición completa de un ambiente. dev, staging y prod usan este mismo módulo
# con distintos tamaños, así los tres ambientes son idénticos en forma.

module "security" {
  source = "../security"
  name   = var.name
  region = var.region
}

module "network" {
  source      = "../network"
  name        = var.name
  region      = var.region
  cidr        = var.vpc_cidr
  single_nat  = var.single_nat
  kms_key_arn = module.security.kms_key_arn
}

resource "aws_security_group" "app" {
  name_prefix = "${var.name}-app-"
  vpc_id      = module.network.vpc_id
  description = "Contenedores de la API"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_egress_rule" "app_https" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "Servicios de AWS y proveedores (SINPE, Didit, SMS) por HTTPS"
}

resource "aws_vpc_security_group_egress_rule" "app_postgres" {
  description       = "Postgres dentro de la VPC"
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = module.network.vpc_cidr
  from_port         = 5432
  to_port           = 5432
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "app_redis" {
  description       = "Redis dentro de la VPC"
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = module.network.vpc_cidr
  from_port         = 6379
  to_port           = 6379
  ip_protocol       = "tcp"
}

module "data" {
  source                = "../data"
  name                  = var.name
  vpc_id                = module.network.vpc_id
  data_subnet_ids       = module.network.data_subnet_ids
  app_security_group_id = aws_security_group.app.id
  kms_key_arn           = module.security.kms_key_arn
  db_instance_class     = var.db_instance_class
  redis_node_type       = var.redis_node_type
  multi_az              = var.multi_az
  backup_retention_days = var.backup_retention_days
  deletion_protection   = var.deletion_protection
}

module "api" {
  source                = "../service"
  name                  = var.name
  env                   = var.env
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  app_subnet_ids        = module.network.app_subnet_ids
  app_security_group_id = aws_security_group.app.id
  kms_key_arn           = module.security.kms_key_arn
  waf_arn               = module.security.waf_arn
  certificate_arn       = var.certificate_arn
  db_address            = module.data.db_address
  db_secret_arn         = module.data.db_master_secret_arn
  redis_url_secret_arn  = module.data.redis_url_secret_arn
  image_tag             = var.image_tag
  cpu                   = var.cpu
  memory                = var.memory
  min_tasks             = var.min_tasks
  max_tasks             = var.max_tasks
  deletion_protection   = var.deletion_protection
  alert_emails          = var.alert_emails
}

module "github" {
  source             = "../github_oidc"
  name               = var.name
  github_repo        = var.github_repo
  github_environment = var.env
  create_provider    = var.create_github_oidc_provider
}
