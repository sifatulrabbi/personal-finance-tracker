# Finance Tracker - Setup Guide

Complete setup guide for the Finance Tracker application.

## Quick Start

### 1. Prerequisites

Install the following:

- [Bun](https://bun.sh) v1.0.0 or higher
- [Docker](https://www.docker.com/) and Docker Compose
- [Make](https://www.gnu.org/software/make/) (optional, for convenience commands)

### 2. Clone and Install

```bash
# Navigate to project directory
cd finance-tracker

# Install dependencies
bun install
```

### 3. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env and update the following:
# - AUTH_PASSWORD: Change to a secure password
# - JWT_SECRET: Change to a random 32+ character string
```

Generate a secure JWT secret:

```bash
# Using OpenSSL
openssl rand -base64 32

# Or using Node/Bun
bun -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 4. Start Services

Start PostgreSQL and pgAdmin:

```bash
# Using Docker Compose
docker-compose up -d

# Or using Make
make up
```

Verify services are running:

```bash
docker-compose ps
```

You should see:

- `finance-tracker-db` (PostgreSQL) - Port 5432
- `finance-tracker-pgadmin` (pgAdmin) - Port 5050

### 5. Database Setup

Generate and run migrations:

```bash
cd apps/api
bun run db:generate
bun run db:migrate
```

Seed initial data:

```bash
bun run db:seed
```

This creates:

- Default user (credentials from .env)
- 10+ default currencies
- Default income/expense categories

### 6. Start Development Servers

From project root:

```bash
# Start all apps (API + Web)
bun run dev

# Or start individually:
# API server
cd apps/api && bun run dev

# Web app (in new terminal)
cd apps/web && bun run dev
```

Access the application:

- **Web App**: http://localhost:3000
- **API**: http://localhost:3001
- **pgAdmin**: http://localhost:5050 (admin@finance-tracker.local / admin)

## Project Structure

```
finance-tracker/
├── apps/
│   ├── api/                 # Backend API server
│   │   ├── src/
│   │   │   ├── config/      # Environment configuration
│   │   │   ├── controllers/ # Route controllers
│   │   │   ├── db/          # Database schema & migrations
│   │   │   ├── middleware/  # Auth & other middleware
│   │   │   ├── models/      # Data models
│   │   │   ├── repositories/# Data access layer
│   │   │   ├── routes/      # API routes
│   │   │   ├── services/    # Business logic
│   │   │   └── index.ts     # Entry point
│   │   └── package.json
│   └── web/                 # Frontend React app
├── packages/
│   ├── config/              # Shared configuration
│   ├── types/               # Shared TypeScript types
│   ├── ui/                  # Shared UI components
│   └── utils/               # Shared utilities
├── docker-compose.yml       # Docker services
├── Makefile                 # Convenience commands
├── package.json             # Root package.json
└── .env                     # Environment variables
```

## Database Management

### Using pgAdmin

1. Access pgAdmin at http://localhost:5050
2. Login: `admin@finance-tracker.local` / `admin`
3. Add server:
   - Host: `postgres` (or `localhost` from host machine)
   - Port: `5432`
   - Database: `finance_tracker`
   - Username: `postgres`
   - Password: `password` (from .env)

### Using Drizzle Studio

```bash
cd apps/api
bun run db:studio
```

Opens a GUI at http://localhost:4983

### Command Line

Connect to PostgreSQL:

```bash
# Using Docker Compose
docker-compose exec postgres psql -U postgres -d finance_tracker

# Or using Make
make db-shell
```

## API Testing

### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'
```

Save the returned token.

### Create Account

```bash
curl -X POST http://localhost:3001/api/accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "My Checking Account",
    "type": "checking",
    "currency": "USD",
    "initialBalance": "1000.00"
  }'
```

### Create Transaction

```bash
curl -X POST http://localhost:3001/api/transactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "accountId": "ACCOUNT_ID",
    "type": "expense",
    "amount": "50.00",
    "description": "Groceries"
  }'
```

## Troubleshooting

### Port Already in Use

If port 3001, 5432, or 5050 is already in use:

1. Update ports in `docker-compose.yml`
2. Update `PORT` in `.env`
3. Restart services

### Database Connection Issues

Check if PostgreSQL is running:

```bash
docker-compose ps postgres
```

View logs:

```bash
docker-compose logs postgres
```

Restart database:

```bash
docker-compose restart postgres
```

### Migration Issues

Reset database (WARNING: deletes all data):

```bash
# Stop services
docker-compose down -v

# Start fresh
docker-compose up -d
cd apps/api
bun run db:migrate
bun run db:seed
```

### Module Not Found

Reinstall dependencies:

```bash
bun run clean
bun install
```

## Development Workflow

### Making Database Changes

1. Update schema in `apps/api/src/db/schema/`
2. Generate migration:
   ```bash
   cd apps/api
   bun run db:generate
   ```
3. Review generated migration in `src/db/migrations/`
4. Apply migration:
   ```bash
   bun run db:migrate
   ```

### Adding New API Endpoints

1. Create repository in `repositories/`
2. Create controller in `controllers/`
3. Create routes in `routes/`
4. Register routes in `index.ts`

## Useful Commands

### Make Commands

```bash
make help        # Show all commands
make up          # Start Docker services
make down        # Stop Docker services
make logs        # View Docker logs
make db-shell    # Connect to database
make install     # Install dependencies
make dev         # Start development servers
make build       # Build all apps
make clean       # Clean and remove volumes
```

### Docker Commands

```bash
# View running containers
docker-compose ps

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Remove volumes (deletes data)
docker-compose down -v

# Restart specific service
docker-compose restart postgres
```

## Next Steps

- [ ] Configure frontend to connect to API
- [ ] Implement remaining features (budgets, goals, tags, etc.)
- [ ] Add data import/export functionality
- [ ] Set up production deployment
- [ ] Add automated tests
- [ ] Configure CI/CD pipeline

## Security Checklist

Before deploying to production:

- [ ] Change `AUTH_PASSWORD` to a strong password
- [ ] Generate secure `JWT_SECRET` (32+ characters)
- [ ] Update `DB_PASSWORD` to a strong password
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS
- [ ] Configure proper CORS origins
- [ ] Set up database backups
- [ ] Review and update security headers
- [ ] Enable rate limiting
- [ ] Set up monitoring and logging

## Support

For issues and questions:

- Check the troubleshooting section above
- Review application logs
- Check Docker logs: `docker-compose logs`

## License

Private
