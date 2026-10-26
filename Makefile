.PHONY: up down test lint check seed migrate tf-check

up:            ## Levanta todo el entorno local
	docker compose up --build

down:
	docker compose down -v

test:          ## Pruebas del backend (requiere Postgres en localhost)
	cd backend && python -m pytest -q

lint:
	cd backend && ruff check app tests && mypy app

check: lint test  ## Todo lo que corre CI antes de un merge
	cd backend && bandit -q -r app -c pyproject.toml && pip-audit -r requirements.txt

migrate:
	cd backend && alembic upgrade head

seed:
	cd backend && python -m app.seed --reset

tf-check:      ## Formato y validación de Terraform
	terraform -chdir=infra/envs/dev fmt -check -recursive ../../ && terraform -chdir=infra/envs/dev validate
