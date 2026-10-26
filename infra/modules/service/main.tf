# API en ECS Fargate detrás de un ALB con HTTPS (TLS 1.2+), WAF y autoescalado.
# Las imágenes son inmutables y se escanean al subirse a ECR. Los secretos se inyectan desde
# Secrets Manager al iniciar el contenedor; ninguno vive en el código ni en variables planas.

data "aws_region" "this" {}

# ---------- Registro de imágenes ----------

resource "aws_ecr_repository" "api" {
  name                 = "neobanco-${var.name}-api"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = var.kms_key_arn
  }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Conservar las últimas 50 imágenes"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 50 }
      action       = { type = "expire" }
    }]
  })
}

# ---------- Secretos de la aplicación ----------

resource "tls_private_key" "jwt" {
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

resource "aws_secretsmanager_secret" "jwt_private" {
  #checkov:skip=CKV2_AWS_57:Rotacion manual planificada (rotar invalida sesiones o hashes de auditoria)
  name_prefix = "neobanco/${var.name}/jwt-private-"
  kms_key_id  = var.kms_key_arn
}

resource "aws_secretsmanager_secret_version" "jwt_private" {
  secret_id     = aws_secretsmanager_secret.jwt_private.id
  secret_string = tls_private_key.jwt.private_key_pem_pkcs8
}

resource "random_password" "pii_salt" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "pii_salt" {
  #checkov:skip=CKV2_AWS_57:Rotacion manual planificada (rotar invalida sesiones o hashes de auditoria)
  name_prefix = "neobanco/${var.name}/pii-salt-"
  kms_key_id  = var.kms_key_arn
}

resource "aws_secretsmanager_secret_version" "pii_salt" {
  secret_id     = aws_secretsmanager_secret.pii_salt.id
  secret_string = random_password.pii_salt.result
}

# ---------- Red de la API ----------

resource "aws_security_group" "alb" {
  name_prefix = "${var.name}-alb-"
  vpc_id      = var.vpc_id
  description = "ALB publico: solo HTTPS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  description       = "HTTPS publico"
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  #checkov:skip=CKV_AWS_260:El puerto 80 solo responde una redireccion 301 a HTTPS
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  description       = "Solo para redirigir a HTTPS"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_app" {
  description                  = "Hacia los contenedores de la API"
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = var.app_security_group_id
  from_port                    = 8000
  to_port                      = 8000
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  description                  = "Solo desde el ALB"
  security_group_id            = var.app_security_group_id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 8000
  to_port                      = 8000
  ip_protocol                  = "tcp"
}

resource "aws_s3_bucket" "alb_logs" {
  #checkov:skip=CKV_AWS_145:Los logs de ALB solo admiten cifrado SSE-S3
  #checkov:skip=CKV_AWS_144:Replicacion entre regiones innecesaria para logs de acceso
  #checkov:skip=CKV_AWS_18:Es el propio bucket de logs
  #checkov:skip=CKV2_AWS_62:Sin consumidores de eventos para logs de acceso
  bucket_prefix = "neobanco-${var.name}-alb-logs-"
  force_destroy = !var.deletion_protection
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket                  = aws_s3_bucket.alb_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256" # los logs de ALB solo admiten SSE-S3
    }
  }
}

resource "aws_s3_bucket_versioning" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    id     = "retencion"
    status = "Enabled"
    filter {}
    expiration {
      days = 400
    }
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_elb_service_account" "this" {}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { AWS = data.aws_elb_service_account.this.arn }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.alb_logs.arn}/*"
      },
      {
        Sid       = "SoloTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.alb_logs.arn, "${aws_s3_bucket.alb_logs.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      }
    ]
  })
}

resource "aws_lb" "this" {
  #checkov:skip=CKV2_AWS_76:Log4j cubierto por AWSManagedRulesKnownBadInputsRuleSet en el WAF asociado
  name_prefix                = substr("neo${var.name}", 0, 6)
  load_balancer_type         = "application"
  internal                   = false
  subnets                    = var.public_subnet_ids
  security_groups            = [aws_security_group.alb.id]
  drop_invalid_header_fields = true
  enable_deletion_protection = var.deletion_protection
  idle_timeout               = 30
  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    enabled = true
  }
  depends_on = [aws_s3_bucket_policy.alb_logs]
}

resource "aws_lb_target_group" "api" {
  name_prefix          = substr("neo${var.name}", 0, 6)
  port                 = 8000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 20
  health_check {
    path                = "/health/ready"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_wafv2_web_acl_association" "this" {
  resource_arn = aws_lb.this.arn
  web_acl_arn  = var.waf_arn
}

# ---------- ECS ----------

resource "aws_cloudwatch_log_group" "api" {
  name              = "/neobanco/${var.name}/api"
  retention_in_days = 365
  kms_key_id        = var.kms_key_arn
}

resource "aws_ecs_cluster" "this" {
  name = "neobanco-${var.name}"
  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
}

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Rol de ejecución: solo puede bajar la imagen, escribir logs y leer SUS secretos.
resource "aws_iam_role" "execution" {
  name_prefix        = "${var.name}-exec-"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.jwt_private.arn, aws_secretsmanager_secret.pii_salt.arn,
        var.db_secret_arn, var.redis_url_secret_arn]
      },
      { Effect = "Allow", Action = ["kms:Decrypt"], Resource = [var.kms_key_arn] }
    ]
  })
}

# Rol de la tarea: hoy no necesita permisos de AWS (principio de mínimo privilegio).
resource "aws_iam_role" "task" {
  name_prefix        = "${var.name}-task-"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

locals {
  image = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
  environment = [
    { name = "NEO_ENV", value = var.env },
    { name = "NEO_DB_HOST", value = var.db_address },
    { name = "NEO_JWT_ALGORITHM", value = "ES256" },
    { name = "NEO_JWT_PUBLIC_KEY", value = tls_private_key.jwt.public_key_pem },
    { name = "NEO_EXPOSE_DOCS", value = var.env == "prod" ? "false" : "true" },
    { name = "WEB_CONCURRENCY", value = "2" },
  ]
  secrets = [
    { name = "NEO_DB_USER", valueFrom = "${var.db_secret_arn}:username::" },
    { name = "NEO_DB_PASSWORD", valueFrom = "${var.db_secret_arn}:password::" },
    { name = "NEO_REDIS_URL", valueFrom = var.redis_url_secret_arn },
    { name = "NEO_JWT_PRIVATE_KEY", valueFrom = aws_secretsmanager_secret.jwt_private.arn },
    { name = "NEO_PII_HASH_SALT", valueFrom = aws_secretsmanager_secret.pii_salt.arn },
  ]
  log_config = {
    logDriver = "awslogs"
    options = {
      awslogs-group         = aws_cloudwatch_log_group.api.name
      awslogs-region        = data.aws_region.this.name
      awslogs-stream-prefix = "api"
    }
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "neobanco-${var.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  container_definitions = jsonencode([{
    name                   = "api"
    image                  = local.image
    essential              = true
    readonlyRootFilesystem = true
    user                   = "10001:10001"
    portMappings           = [{ containerPort = 8000, protocol = "tcp" }]
    environment            = local.environment
    secrets                = local.secrets
    linuxParameters        = { capabilities = { drop = ["ALL"] }, initProcessEnabled = true }
    mountPoints            = [{ sourceVolume = "tmp", containerPath = "/tmp" }]
    logConfiguration       = local.log_config
  }])
  volume {
    name = "tmp"
  }
}

# Tarea de una sola vez para migraciones (la lanza el pipeline antes de desplegar).
resource "aws_ecs_task_definition" "migrate" {
  family                   = "neobanco-${var.name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  container_definitions = jsonencode([{
    name                   = "migrate"
    image                  = local.image
    essential              = true
    readonlyRootFilesystem = true
    user                   = "10001:10001"
    # En dev, además, se cargan los datos de prueba si la base está vacía (nunca en staging/prod).
    command          = var.seed_demo_data ? ["sh", "-c", "alembic upgrade head && python -m app.seed"] : ["alembic", "upgrade", "head"]
    environment      = local.environment
    secrets          = local.secrets
    linuxParameters  = { capabilities = { drop = ["ALL"] } }
    mountPoints      = [{ sourceVolume = "tmp", containerPath = "/tmp" }]
    logConfiguration = merge(local.log_config, { options = merge(local.log_config.options, { awslogs-stream-prefix = "migrate" }) })
  }])
  volume {
    name = "tmp"
  }
}

resource "aws_ecs_service" "api" {
  name                              = "api"
  cluster                           = aws_ecs_cluster.this.id
  task_definition                   = aws_ecs_task_definition.api.arn
  desired_count                     = var.min_tasks
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 30
  enable_execute_command            = false
  propagate_tags                    = "SERVICE"
  network_configuration {
    subnets          = var.app_subnet_ids
    security_groups  = [var.app_security_group_id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8000
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true # si la versión nueva no arranca sana, vuelve sola a la anterior
  }
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  lifecycle {
    ignore_changes = [desired_count] # lo maneja el autoescalado
  }
  depends_on = [aws_lb_listener.https]
}

# ---------- Autoescalado ----------

resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.min_tasks
  max_capacity       = var.max_tasks
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "cpu"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  policy_type        = "TargetTrackingScaling"
  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 120
    scale_out_cooldown = 30
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_appautoscaling_policy" "requests" {
  name               = "requests"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  policy_type        = "TargetTrackingScaling"
  target_tracking_scaling_policy_configuration {
    target_value = 400
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.this.arn_suffix}/${aws_lb_target_group.api.arn_suffix}"
    }
  }
}

# ---------- Alarmas ----------

resource "aws_sns_topic" "alerts" {
  name              = "neobanco-${var.name}-alertas"
  kms_master_key_id = var.kms_key_arn
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_cloudwatch_metric_alarm" "errors_5xx" {
  alarm_name          = "neobanco-${var.name}-5xx"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  dimensions          = { LoadBalancer = aws_lb.this.arn_suffix }
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 5
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "latency" {
  alarm_name          = "neobanco-${var.name}-latencia-p95"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  dimensions          = { LoadBalancer = aws_lb.this.arn_suffix }
  extended_statistic  = "p95"
  period              = 60
  evaluation_periods  = 5
  threshold           = 1.5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "unhealthy" {
  alarm_name          = "neobanco-${var.name}-sin-tareas-sanas"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  dimensions          = { LoadBalancer = aws_lb.this.arn_suffix, TargetGroup = aws_lb_target_group.api.arn_suffix }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "waf_blocks" {
  alarm_name          = "neobanco-${var.name}-waf-bloqueos"
  namespace           = "AWS/WAFV2"
  metric_name         = "BlockedRequests"
  dimensions          = { WebACL = "neobanco-${var.name}", Region = data.aws_region.this.name, Rule = "ALL" }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 500
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# Bitácora de eventos sensibles que llegan en los logs (ingresos fallidos, reuso de tokens).
resource "aws_cloudwatch_log_metric_filter" "token_reuse" {
  name           = "reuso-refresh-token"
  log_group_name = aws_cloudwatch_log_group.api.name
  pattern        = "{ $.event = \"refresh_reuse_detected\" }"
  metric_transformation {
    name      = "RefreshTokenReuse"
    namespace = "Neobanco/${var.name}"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "token_reuse" {
  alarm_name          = "neobanco-${var.name}-reuso-de-sesion"
  alarm_description   = "Alguien usó un refresh token ya rotado: posible robo de sesión."
  namespace           = "Neobanco/${var.name}"
  metric_name         = "RefreshTokenReuse"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
