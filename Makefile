.PHONY: help up down logs db-shell install dev build clean

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

up: ## Start all Docker services
	docker-compose up -d

down: ## Stop all Docker services
	docker-compose down

logs: ## View Docker service logs
	docker-compose logs -f

db-shell: ## Connect to PostgreSQL database shell
	docker-compose exec postgres psql -U postgres -d finance_tracker

install: ## Install dependencies
	bun install

dev: ## Start development servers (requires Docker to be running)
	bun run dev

build: ## Build all applications
	bun run build

clean: ## Clean up node_modules and Docker volumes
	bun run clean
	docker-compose down -v
