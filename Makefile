# ═══════════════════════════════════════════════════════════════════
# UN ProjectAdvisor — Makefile
# ═══════════════════════════════════════════════════════════════════
#
# Quick reference:
#   make dev        — Start development stack
#   make prod       — Start production stack
#   make stop       — Stop all containers
#   make logs       — Follow API logs
#   make test       — Run all tests
#   make status     — Show service health
#   make help       — Show all commands
#
# ═══════════════════════════════════════════════════════════════════

.PHONY: help dev prod stop restart logs status test build clean ps \
        dev-ui prod-full shell redis-cli health

# Default target
.DEFAULT_GOAL := help

# ─────────────────────────────────────────────────────────────
# Variables
# ─────────────────────────────────────────────────────────────
COMPOSE         := docker-compose
COMPOSE_DEV     := $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_PROD    := $(COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml
API_CONTAINER   := projectadvisor-api

# ─────────────────────────────────────────────────────────────
# Development
# ─────────────────────────────────────────────────────────────

## Start development stack (API + Redis + Memgraph + Qdrant)
dev:
	$(COMPOSE_DEV) up --build

## Start development stack with UI
dev-ui:
	$(COMPOSE_DEV) --profile ui up --build

## Start development in background
dev-bg:
	$(COMPOSE_DEV) up --build -d
	@echo "Development stack started. Use 'make logs' to follow output."

# ─────────────────────────────────────────────────────────────
# Production
# ─────────────────────────────────────────────────────────────

## Start production stack (detached)
prod:
	$(COMPOSE_PROD) up --build -d

## Start full production stack (with ETL + UI)
prod-full:
	$(COMPOSE_PROD) --profile etl --profile ui up --build -d

# ─────────────────────────────────────────────────────────────
# Common Operations
# ─────────────────────────────────────────────────────────────

## Stop all containers
stop:
	$(COMPOSE) down

## Restart all containers
restart:
	$(COMPOSE) down
	$(COMPOSE) up --build -d

## Show running containers
ps:
	$(COMPOSE) ps

## Show service status and health
status:
	@echo "=== Container Status ==="
	@$(COMPOSE) ps
	@echo ""
	@echo "=== API Health ==="
	@curl -s http://localhost:$${API_PORT:-3010}/health 2>/dev/null | python -m json.tool 2>/dev/null || echo "API not reachable"
	@echo ""
	@echo "=== Redis ==="
	@docker exec projectadvisor-redis redis-cli ping 2>/dev/null || echo "Redis not reachable"
	@echo ""
	@echo "=== Qdrant ==="
	@curl -s http://localhost:$${QDRANT_HTTP_PORT:-6333}/healthz 2>/dev/null || echo "Qdrant not reachable"

# ─────────────────────────────────────────────────────────────
# Logs
# ─────────────────────────────────────────────────────────────

## Follow API logs
logs:
	$(COMPOSE) logs -f api

## Follow all service logs
logs-all:
	$(COMPOSE) logs -f

# ─────────────────────────────────────────────────────────────
# Build & Clean
# ─────────────────────────────────────────────────────────────

## Build all images
build:
	$(COMPOSE) build

## Build API image only
build-api:
	$(COMPOSE) build api

## Stop containers, remove volumes and images
clean:
	$(COMPOSE) down -v --rmi local
	@echo "Cleaned up containers, volumes, and local images."

# ─────────────────────────────────────────────────────────────
# Testing
# ─────────────────────────────────────────────────────────────

## Run all API tests (local, no Docker)
test:
	cd api && npm test

## Run e2e tests
test-e2e:
	cd api && node tests/e2e/test-openapi.js
	cd api && node tests/e2e/test-production-config.js
	cd api && node tests/e2e/test-docker-config.js

## Run Docker config validation
test-docker:
	node api/tests/e2e/test-docker-config.js

## Seed approval workflow data
seed-approval:
	node api/scripts/seed-approval-schema.js

## Seed approval workflow (clear first)
seed-approval-clean:
	node api/scripts/seed-approval-schema.js --clear

## Test approval workflow E2E
test-approval:
	node api/scripts/test-approval-flow.js

# ─────────────────────────────────────────────────────────────
# Shell Access
# ─────────────────────────────────────────────────────────────

## Open shell in API container
shell:
	docker exec -it $(API_CONTAINER) /bin/sh

## Open Redis CLI
redis-cli:
	docker exec -it projectadvisor-redis redis-cli

# ─────────────────────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────────────────────

## Quick health check
health:
	@curl -s http://localhost:$${API_PORT:-3010}/health | python -m json.tool 2>/dev/null || echo "API not reachable"

# ─────────────────────────────────────────────────────────────
# Help
# ─────────────────────────────────────────────────────────────

## Show this help message
help:
	@echo "UN ProjectAdvisor — Available Commands"
	@echo "══════════════════════════════════════════"
	@echo ""
	@echo "Development:"
	@echo "  make dev          Start dev stack (foreground)"
	@echo "  make dev-ui       Start dev stack with frontend"
	@echo "  make dev-bg       Start dev stack (background)"
	@echo ""
	@echo "Production:"
	@echo "  make prod         Start production stack"
	@echo "  make prod-full    Start production with ETL + UI"
	@echo ""
	@echo "Operations:"
	@echo "  make stop         Stop all containers"
	@echo "  make restart      Restart all containers"
	@echo "  make ps           Show container status"
	@echo "  make status       Full health status report"
	@echo "  make logs         Follow API logs"
	@echo "  make logs-all     Follow all logs"
	@echo ""
	@echo "Build & Clean:"
	@echo "  make build        Build all images"
	@echo "  make build-api    Build API image only"
	@echo "  make clean        Remove containers, volumes, images"
	@echo ""
	@echo "Testing:"
	@echo "  make test         Run API unit tests"
	@echo "  make test-e2e     Run all e2e tests"
	@echo "  make test-docker  Run Docker config validation"
	@echo ""
	@echo "Access:"
	@echo "  make shell        Shell into API container"
	@echo "  make redis-cli    Open Redis CLI"
	@echo "  make health       Quick API health check"
