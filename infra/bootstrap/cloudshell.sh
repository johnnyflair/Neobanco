#!/usr/bin/env bash
# Arranque de AWS en un solo paso, para correr en AWS CloudShell (región N. Virginia, us-east-1)
# con un usuario administrador. Se puede correr de nuevo sin problema: lo que ya existe se reusa.
#
#   curl -fsSL https://raw.githubusercontent.com/johnnyflair/Neobanco/main/infra/bootstrap/cloudshell.sh -o cloudshell.sh
#   bash cloudshell.sh midominio.com mi-correo@ejemplo.com
#
# Qué hace:
#   1. Instala OpenTofu (verificando su checksum) y baja el repositorio.
#   2. Crea el bucket cifrado donde vive el estado de la infraestructura.
#   3. Pide el certificado *.midominio.com y, si el dominio está en Route 53, lo valida solo.
#   4. Crea el rol que GitHub usa para desplegar (OIDC, sin llaves guardadas).
#   5. Crea una alerta de presupuesto por correo.
#   6. Imprime las variables para pegar en GitHub. El resto (red, base de datos, API) lo crea
#      el primer despliegue desde GitHub.
set -euo pipefail

DOMAIN="${1:?Uso: bash cloudshell.sh midominio.com correo@ejemplo.com}"
DOMAIN="${DOMAIN%.}"
EMAIL="${2:-}"
TOFU_VERSION="1.10.6"
REPO_URL="https://github.com/johnnyflair/Neobanco.git"
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1

paso() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33m%s\033[0m\n' "$*"; }

paso "Cuenta de AWS"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "Cuenta $ACCOUNT · región $AWS_REGION · dominio $DOMAIN"

paso "1/6 OpenTofu $TOFU_VERSION"
export PATH="$HOME/.local/bin:$PATH"
if ! tofu version 2>/dev/null | grep -q "v$TOFU_VERSION"; then
  ARCH=$(uname -m); [ "$ARCH" = "x86_64" ] && ARCH=amd64; [ "$ARCH" = "aarch64" ] && ARCH=arm64
  TMP=$(mktemp -d); cd "$TMP"
  BASE="https://github.com/opentofu/opentofu/releases/download/v$TOFU_VERSION"
  curl -fsSLO "$BASE/tofu_${TOFU_VERSION}_linux_${ARCH}.zip"
  curl -fsSLO "$BASE/tofu_${TOFU_VERSION}_SHA256SUMS"
  sha256sum --ignore-missing -c "tofu_${TOFU_VERSION}_SHA256SUMS"
  mkdir -p "$HOME/.local/bin" && unzip -oq "tofu_${TOFU_VERSION}_linux_${ARCH}.zip" tofu -d "$HOME/.local/bin"
  cd - >/dev/null
fi
tofu version | head -1

paso "Repositorio"
if [ -d "$HOME/Neobanco/.git" ]; then git -C "$HOME/Neobanco" pull -q --ff-only; else git clone -q --depth 1 "$REPO_URL" "$HOME/Neobanco"; fi
cd "$HOME/Neobanco"

paso "2/6 Bucket del estado"
BUCKET="neobanco-tfstate-$ACCOUNT"
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "Ya existe: $BUCKET"
else
  tofu -chdir=infra/bootstrap init -input=false >/dev/null
  tofu -chdir=infra/bootstrap apply -input=false -auto-approve
fi

paso "3/6 Certificado *.$DOMAIN"
ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN." \
  --query "HostedZones[?Name=='$DOMAIN.' && Config.PrivateZone==\`false\`].Id | [0]" --output text 2>/dev/null || true)
[ "$ZONE_ID" = "None" ] && ZONE_ID=""
if [ -n "$ZONE_ID" ]; then echo "El dominio está en Route 53 ($ZONE_ID): DNS y validación automáticos."; else aviso "El dominio NO está en Route 53: los registros DNS se agregan a mano en tu proveedor."; fi

CERT=$(aws acm list-certificates --certificate-statuses ISSUED PENDING_VALIDATION \
  --query "CertificateSummaryList[?DomainName=='*.$DOMAIN'].CertificateArn | [0]" --output text)
if [ "$CERT" = "None" ] || [ -z "$CERT" ]; then
  CERT=$(aws acm request-certificate --domain-name "*.$DOMAIN" --subject-alternative-names "$DOMAIN" \
    --validation-method DNS --key-algorithm RSA_2048 --idempotency-token neobanco \
    --tags Key=Project,Value=neobanco --query CertificateArn --output text)
  echo "Pedido: $CERT"
  sleep 10
else
  echo "Reuso: $CERT"
fi

STATUS=$(aws acm describe-certificate --certificate-arn "$CERT" --query Certificate.Status --output text)
if [ "$STATUS" != "ISSUED" ]; then
  RECORDS=$(aws acm describe-certificate --certificate-arn "$CERT" \
    --query 'Certificate.DomainValidationOptions[].ResourceRecord' --output json | jq -c 'unique_by(.Name)[]')
  if [ -n "$ZONE_ID" ]; then
    CHANGES=$(echo "$RECORDS" | jq -s '{Changes: [.[] | {Action: "UPSERT", ResourceRecordSet: {Name: .Name, Type: .Type, TTL: 300, ResourceRecords: [{Value: .Value}]}}]}')
    aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" --change-batch "$CHANGES" >/dev/null
    echo "Registro de validación creado en Route 53."
  else
    aviso "Agregá este registro en el DNS de tu proveedor (GoDaddy, Cloudflare, etc.):"
    echo "$RECORDS" | jq -r '"  Tipo: \(.Type)\n  Nombre: \(.Name)\n  Valor: \(.Value)\n"'
    aviso "(En Cloudflare, dejalo en 'DNS only', sin la nube naranja.)"
  fi
  echo "Esperando a que AWS emita el certificado (normalmente 2 a 30 minutos)…"
  until [ "$(aws acm describe-certificate --certificate-arn "$CERT" --query Certificate.Status --output text)" = "ISSUED" ]; do
    printf '.'; sleep 30
  done
  echo
fi
echo "Certificado emitido."

paso "4/6 Rol de despliegue para GitHub (dev)"
cd infra/envs/dev
tofu init -input=false -reconfigure -backend-config="bucket=$BUCKET" -backend-config="region=$AWS_REGION" >/dev/null
tofu apply -input=false -auto-approve -target=module.stack.module.github \
  -var "image_tag=bootstrap" -var "certificate_arn=$CERT" -var "dns_zone_name=${ZONE_ID:+$DOMAIN}"
ROLE=$(tofu output -raw github_deploy_role_arn)
cd "$HOME/Neobanco"

paso "5/6 Alerta de presupuesto"
if [ -n "$EMAIL" ]; then
  if aws budgets describe-budget --account-id "$ACCOUNT" --budget-name neobanco-mensual >/dev/null 2>&1; then
    echo "Ya existe la alerta neobanco-mensual."
  else
    aws budgets create-budget --account-id "$ACCOUNT" \
      --budget '{"BudgetName":"neobanco-mensual","BudgetLimit":{"Amount":"200","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}' \
      --notifications-with-subscribers "[
        {\"Notification\":{\"NotificationType\":\"ACTUAL\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":75,\"ThresholdType\":\"PERCENTAGE\"},\"Subscribers\":[{\"SubscriptionType\":\"EMAIL\",\"Address\":\"$EMAIL\"}]},
        {\"Notification\":{\"NotificationType\":\"FORECASTED\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":100,\"ThresholdType\":\"PERCENTAGE\"},\"Subscribers\":[{\"SubscriptionType\":\"EMAIL\",\"Address\":\"$EMAIL\"}]}
      ]"
    echo "Te escribimos a $EMAIL si el gasto del mes pasa de USD 150 o se proyecta sobre USD 200."
  fi
else
  aviso "Sin correo: no se creó alerta de presupuesto."
fi

paso "6/6 Listo. Cargá esto en GitHub"
if [ -n "$ZONE_ID" ]; then DNS_VAR="$DOMAIN"; else DNS_VAR="(no la crees: el dominio no está en Route 53)"; fi
if [ -n "$EMAIL" ]; then EMAILS_VAR="[\"$EMAIL\"]"; else EMAILS_VAR="[]"; fi
cat <<EOF

Repositorio → Settings → Environments → New environment → nombre: dev
Dentro de "dev" → Environment variables → Add variable (una por línea):

  AWS_DEPLOY_ROLE_ARN   $ROLE
  TF_STATE_BUCKET       $BUCKET
  ACM_CERTIFICATE_ARN   $CERT
  DNS_ZONE_NAME         $DNS_VAR
  ALERT_EMAILS          $EMAILS_VAR

Después: Actions → Deploy → Run workflow → dev. El primer despliegue tarda ~25 minutos
(la base de datos es lo más lento). Cuando termine, la API queda en:

  https://api-dev.$DOMAIN/docs
EOF
if [ -z "$ZONE_ID" ]; then
  aviso "Como el dominio no está en Route 53: al terminar el despliegue, creá en tu proveedor un CNAME"
  aviso "  api-dev.$DOMAIN → (el valor 'alb_dns_name' que muestra el despliegue en GitHub)"
fi
[ -n "$EMAIL" ] && aviso "Revisá tu correo y confirmá la suscripción de AWS a las alertas."
