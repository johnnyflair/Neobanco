# GitHub Actions entra a AWS con OIDC: sin llaves de acceso guardadas en GitHub.
# El rol solo lo puede asumir un job que corre en el ambiente de GitHub indicado
# (y producción exige aprobación manual en GitHub).

data "tls_certificate" "github" {
  url = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github" {
  count           = var.create_provider ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github.certificates[0].sha1_fingerprint]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  provider_arn = var.create_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}

resource "aws_iam_role" "deploy" {
  name = "neobanco-${var.name}-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:environment:${var.github_environment}"
        }
      }
    }]
  })
  max_session_duration = 3600
}

# Terraform necesita crear y cambiar recursos de toda la plataforma. El control está en quién
# puede asumir el rol (solo el ambiente de GitHub, con revisores en prod), no en recortar acciones.
resource "aws_iam_role_policy_attachment" "deploy" {
  #checkov:skip=CKV_AWS_274:Rol de Terraform; solo lo asume el ambiente de GitHub con aprobacion
  for_each   = toset(var.policy_arns)
  role       = aws_iam_role.deploy.name
  policy_arn = each.value
}
