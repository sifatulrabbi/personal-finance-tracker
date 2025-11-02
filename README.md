# Finance Tracker

A comprehensive personal finance tracking application built with Bun, React, and PostgreSQL.

## Features

- 💰 **Transaction Management** - Track income, expenses, and transfers
- 🏦 **Multiple Accounts** - Manage checking, savings, credit cards, and more
- 📊 **Budgeting** - Set and track budgets by category
- 📈 **Analytics** - Visualize spending patterns and trends
- 🏷️ **Categories & Tags** - Organize transactions with custom categories and tags
- 🎯 **Financial Goals** - Set and track progress toward savings goals
- 🔄 **Recurring Transactions** - Automate regular income and expenses
- 💱 **Multi-currency** - Support for multiple currencies with exchange rates
- 🔐 **Secure** - JWT authentication with single-user mode
- 📱 **Modern UI** - Responsive design built with React

## Project Structure

This is a Bun monorepo with the following structure:

```
finance-tracker/
├── apps/
│   ├── api/             # Backend API server (Bun + Hono + PostgreSQL)
│   └── web/             # React web application (Vite)
├── packages/
│   ├── types/           # Shared TypeScript types
│   ├── ui/              # Shared UI components
│   ├── config/          # Shared configuration
│   └── utils/           # Shared utility functions
├── docker-compose.yml   # Docker services (PostgreSQL, pgAdmin)
└── Makefile            # Convenience commands
```

## Prerequisites

- [Bun](https://bun.sh) v1.0.0 or higher
- [Docker](https://www.docker.com/) and Docker Compose
- Make (optional, for convenience commands)

## Quick Start

For detailed setup instructions, see [SETUP.md](./SETUP.md).

1. **Install dependencies:**

```bash
bun install
```

2. **Setup environment:**

```bash
cp .env.example .env
# Edit .env and update credentials
```

3. **Start services:**

```bash
# Start PostgreSQL
docker-compose up -d

# Or using Make
make up
```

4. **Setup database:**

```bash
cd apps/api
bun run db:generate
bun run db:migrate
bun run db:seed
```

5. **Start development servers:**

```bash
# From root directory
bun run dev
```

Access the application:

- **Web App**: http://localhost:3000
- **API**: http://localhost:3001
- **pgAdmin**: http://localhost:5050

## Available Scripts

### Root Scripts

- `bun run dev` - Start all apps in development mode
- `bun run build` - Build all apps for production
- `bun run type-check` - Run TypeScript type checking across all packages
- `bun run clean` - Remove all node_modules directories

### API Scripts (apps/api)

- `bun run dev` - Start API server with hot reload
- `bun run db:generate` - Generate database migrations
- `bun run db:migrate` - Run database migrations
- `bun run db:seed` - Seed database with initial data
- `bun run db:studio` - Open Drizzle Studio (database GUI)

### Make Commands

- `make up` - Start Docker services
- `make down` - Stop Docker services
- `make logs` - View Docker logs
- `make db-shell` - Connect to PostgreSQL shell
- `make dev` - Start development servers

## Technology Stack

### Backend (API)

- **Runtime**: Bun
- **Framework**: Hono (lightweight web framework)
- **Database**: PostgreSQL 16
- **ORM**: Drizzle ORM
- **Authentication**: JWT (jose)
- **Validation**: Zod

### Frontend (Web)

- **Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS (to be configured)

### Infrastructure

- **Containerization**: Docker & Docker Compose
- **Database Admin**: pgAdmin 4

## API Documentation

See [apps/api/README.md](./apps/api/README.md) for detailed API documentation.

### Authentication

```bash
POST /api/auth/login
GET /api/auth/me
```

### Accounts

```bash
GET    /api/accounts
POST   /api/accounts
GET    /api/accounts/:id
PATCH  /api/accounts/:id
DELETE /api/accounts/:id
```

### Transactions

```bash
GET    /api/transactions
POST   /api/transactions
GET    /api/transactions/:id
PATCH  /api/transactions/:id
DELETE /api/transactions/:id
GET    /api/transactions/summary
```

## Packages

### @finance-tracker/api

Backend API server with authentication, accounts, transactions, and more.

### @finance-tracker/web

React web application with modern UI for managing finances.

### @finance-tracker/types

Shared TypeScript types and interfaces for the entire application.

### @finance-tracker/ui

Reusable React components used across the application.

### @finance-tracker/config

Application configuration and constants.

### @finance-tracker/utils

Utility functions for formatting, calculations, and data manipulation.

## Development

Comprehensive development documentation is available in [SETUP.md](./SETUP.md).

## Security

⚠️ **Important Security Notes:**

- Change default credentials before deploying to production
- Use a strong, random JWT_SECRET (minimum 32 characters)
- Never commit `.env` files to version control
- Use HTTPS in production
- Regularly update dependencies

## Contributing

This is a private project. For any questions or issues, please contact the project maintainer.

## License

Private
