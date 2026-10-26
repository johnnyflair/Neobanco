# Neobanco cooperativo

App de banca digital para vender o licenciar a una cooperativa en Costa Rica (nombre de trabajo: **App**).

| Carpeta | Qué es |
| --- | --- |
| `backend/` | API en Python (FastAPI + PostgreSQL). Endpoints de cuentas, tarjetas, transferencias, recibos, ahorro, préstamos y recompensas. |
| `mobile/` | App en React Native con Expo (iOS y Android). |
| `infra/` | Infraestructura en AWS como código (Terraform / OpenTofu) para dev, staging y prod. |
| `.github/` | CI (pruebas y escaneos de seguridad en cada cambio) y despliegue a AWS. |

Prototipo navegable del diseño: https://claude.ai/artifact/8HZwDAc1vWWqn4eGaqMf6v · Tablero: https://miro.com/app/board/uXjVEVH8EF4=/

## Arrancar en local

```bash
docker compose up --build          # Postgres, Redis, migraciones, datos de prueba y API
open http://localhost:8000/docs    # documentación interactiva de todos los endpoints
```

Asociada de prueba: celular **88112030** (o cédula 1-1234-0567), clave **482915**. Hay otros dos asociados con la misma clave: 70231188 y 61049932.

La App:

```bash
cd mobile && cp .env.example .env && npm install && npx expo start
```

Sin Docker: Postgres 16 local, `cd backend && pip install -r requirements-dev.txt && alembic upgrade head && python -m app.seed && uvicorn app.main:app --reload`.

## Cómo está hecho

### Datos de mentira hoy, core real mañana

Todos los endpoints hablan con contratos definidos en `backend/app/providers/base.py`, nunca directo con un sistema:

| Contrato | Hoy (simulado) | Con la cooperativa |
| --- | --- | --- |
| `CoreBanking` | Tablas locales de cuentas y movimientos | Core bancario de la cooperativa |
| `CardProcessor` | Tarjetas de prueba | Procesador de tarjetas (el número completo nunca toca nuestro backend) |
| `SinpeGateway` | Nombres y respuestas generadas | SINPE Móvil, transferencias y débito en tiempo real |
| `BillAggregator` | Montos generados por número de servicio | Agregador de pago de servicios |
| `IdentityVerifier` | Cédulas que terminan en 0 quedan en revisión | Didit (cédula + selfie con prueba de vida) |
| `Messenger` | Solo registra en el log | Proveedor de SMS y WhatsApp |

Conectar una cooperativa = implementar esas clases contra sus sistemas y elegirlas en `app/providers/__init__.py`. La App, los endpoints y las pruebas no cambian.

### Seguridad

- **Clave de 6 dígitos y códigos OTP** con Argon2id. Bloqueo de 15 minutos tras 5 intentos; mismo tiempo de respuesta exista o no la persona.
- **Sesiones:** access token de 10 minutos (ES256 en staging y prod) y refresh token rotativo. Si alguien reusa un refresh token viejo, se cierran todas las sesiones de esa familia y se dispara una alarma.
- **Plata:** toda operación que mueve dinero exige `Idempotency-Key`; un reintento por mala señal nunca cobra dos veces. Saldos con bloqueo de fila y montos `NUMERIC(18,2)`, nunca decimales de punto flotante.
- **Paso adicional:** subir límites de tarjeta, ver el número completo o desbloquear exigen clave; bloquear no (en una emergencia no debe haber fricción).
- **Privacidad:** el recurso de otra persona responde 404 (no revela que existe). Logs en JSON sin datos personales (cédula, IBAN, teléfono, tokens se redactan). Auditoría de cada acción sensible con la IP en hash.
- **Límites de intentos** por IP y por celular (Redis compartido entre réplicas) y además WAF en AWS.
- **Cabeceras** HSTS, `no-store`, CSP, `nosniff`; errores en formato estándar `application/problem+json` con mensajes listos para mostrar.
- **App:** el refresh token vive en el llavero del teléfono (solo este dispositivo, solo desbloqueado); al abrir pide Face ID o huella; en producción se niega a hablar con una API sin HTTPS.

### Infraestructura (AWS)

- **Red en 3 zonas:** el balanceador es lo único público; los contenedores no tienen IP pública; la base de datos y Redis viven en subredes sin salida a internet. Endpoints privados para ECR, Secrets Manager, logs y KMS. Registro de tráfico de red.
- **Cómputo:** ECS Fargate (ARM64), sistema de archivos de solo lectura, usuario sin privilegios, sin capacidades de Linux. Autoescalado por CPU y por peticiones; si una versión nueva no arranca sana, vuelve sola a la anterior.
- **Datos:** RDS PostgreSQL 16 multi-AZ cifrado con llave KMS propia, TLS obligatorio, contraseña generada y rotada por AWS, respaldos de 35 días en prod, protección contra borrado. Redis con TLS y token.
- **Borde:** ALB con TLS 1.3, HTTP redirige a HTTPS, WAF con reglas administradas de AWS, reputación de IPs y límites por IP (más estrictos en `/v1/auth/`).
- **Secretos:** Secrets Manager; ninguno en el código ni en variables planas. Las llaves JWT se generan en Terraform.
- **Observabilidad:** logs en CloudWatch cifrados (1 año), alarmas de errores 5xx, latencia p95, tareas sanas y bloqueos del WAF, enviadas por correo.
- **Ambientes:** `dev` (pequeño, un NAT), `staging` (igual a prod en forma) y `prod`. Mismo módulo, distinto tamaño.

### CI/CD

- **En cada cambio:** ruff, mypy, migraciones desde cero y `alembic check`, 35 pruebas contra Postgres real, bandit, pip-audit, gitleaks, build de la imagen con trivy, formato y validación de Terraform, checkov, tipos de la App y auditoría de dependencias.
- **Despliegue:** GitHub entra a AWS por OIDC (sin llaves guardadas). Cada merge a `main` despliega a dev; staging y prod se lanzan a mano y prod exige aprobación. Orden: imagen → migraciones como tarea aparte → despliegue sin caída → prueba de humo.
- **Dependabot** actualiza dependencias de Python, npm, Docker, Actions y Terraform cada semana.

## Poner AWS en marcha por primera vez

1. `tofu -chdir=infra/bootstrap init && tofu -chdir=infra/bootstrap apply` crea el bucket del estado (una vez por cuenta).
2. Pedir en ACM el certificado de `api-dev.<dominio>` (y luego staging y prod).
3. Aplicar dev a mano la primera vez: `tofu -chdir=infra/envs/dev init -backend-config="bucket=<bucket>" -backend-config="region=us-east-1"` y `tofu -chdir=infra/envs/dev apply -var image_tag=bootstrap -var certificate_arn=<arn>`.
4. En GitHub, crear los ambientes `dev`, `staging` y `prod` (con revisores en prod) y cargar las variables `AWS_DEPLOY_ROLE_ARN` (salida `github_deploy_role_arn`), `TF_STATE_BUCKET`, `ACM_CERTIFICATE_ARN` y `ALERT_EMAILS`.
5. Apuntar el DNS de la API al `alb_dns_name`.

## Pendientes conocidos

- Endurecimiento previo a producción: usuario de base de datos propio de la App (no el maestro), certificate pinning en la App, rotación programada de las llaves JWT, pentest externo y revisión de cumplimiento con la cooperativa (SUGEF, ley 8204).
- Tasas, límites y reglas de puntos son de ejemplo hasta tener las de la cooperativa.
- La App hoy tiene ingreso e inicio; el resto de pantallas del prototipo se construye sobre esta base.
