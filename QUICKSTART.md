# Finance Tracker - Quick Start Guide

Get the Finance Tracker up and running in 5 minutes!

## Prerequisites Check

```bash
# Check if Bun is installed
bun --version

# Check if Docker is installed
docker --version
docker-compose --version
```

If any are missing, install them from:

- Bun: https://bun.sh
- Docker: https://www.docker.com/

## Step-by-Step Setup

### 1. Install Dependencies (30 seconds)

```bash
bun install
```

### 2. Configure Environment (1 minute)

```bash
# Copy the environment template
cp .env.example .env
```

**Edit `.env` and change these critical values:**

```bash
# Generate a secure password
AUTH_PASSWORD=YourSecurePassword123!

# Generate a random JWT secret (run this command):
# openssl rand -base64 32
JWT_SECRET=your-random-32-character-secret-here
```

### 3. Start Database (30 seconds)

```bash
# Start PostgreSQL and pgAdmin
docker-compose up -d

# Verify services are running
docker-compose ps
```

You should see:

- ✅ finance-tracker-db (port 5432)
- ✅ finance-tracker-pgadmin (port 5050)

### 4. Setup Database (1 minute)

```bash
cd apps/api

# Generate migration files
bun run db:generate

# Run migrations
bun run db:migrate

# Seed with initial data
bun run db:seed
```

You'll see:

- ✅ Default currencies added
- ✅ Default categories created
- ✅ Admin user created

**Default Login Credentials:**

- Username: `admin` (from .env AUTH_USERNAME)
- Password: (what you set in .env AUTH_PASSWORD)

### 5. Start Development Servers (30 seconds)

```bash
# From apps/api directory
bun run dev

# In a new terminal, start the web app
cd apps/web
bun run dev
```

## Access Your Application

- 🌐 **Web App**: http://localhost:3000
- 🔌 **API**: http://localhost:3001
- 📊 **pgAdmin**: http://localhost:5050
  - Email: `admin@finance-tracker.local`
  - Password: `admin`

## Test the API

### 1. Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YourPassword"}'
```

Copy the returned `token` value.

### 2. Create Your First Account

```bash
curl -X POST http://localhost:3001/api/accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "name": "My Checking Account",
    "type": "checking",
    "currency": "USD",
    "initialBalance": "1000.00",
    "description": "Primary checking account"
  }'
```

### 3. Create Your First Transaction

```bash
curl -X POST http://localhost:3001/api/transactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "accountId": "ACCOUNT_ID_FROM_PREVIOUS_STEP",
    "type": "expense",
    "amount": "50.00",
    "description": "Grocery shopping",
    "date": "2024-11-02T10:00:00Z"
  }'
```

### 4. View Your Accounts

```bash
curl http://localhost:3001/api/accounts \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Common Issues & Solutions

### "Port already in use"

If port 3001, 5432, or 5050 is busy:

```bash
# Check what's using the port
lsof -i :3001

# Stop the process or change port in .env
```

### "Database connection failed"

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# View logs
docker-compose logs postgres

# Restart
docker-compose restart postgres
```

### "Module not found"

```bash
# Reinstall dependencies
rm -rf node_modules apps/*/node_modules packages/*/node_modules
bun install
```

### "Migration failed"

```bash
# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d
cd apps/api
bun run db:migrate
bun run db:seed
```

## Quick Commands Reference

```bash
# Start everything
docker-compose up -d && cd apps/api && bun run dev

# Stop everything
docker-compose down

# View logs
docker-compose logs -f

# Database shell
docker-compose exec postgres psql -U postgres -d finance_tracker

# Reset everything
docker-compose down -v
docker-compose up -d
cd apps/api
bun run db:migrate
bun run db:seed
```

## Next Steps

✅ Your backend is ready!

Now you can:

1. Configure the frontend to connect to the API
2. Build the UI components
3. Add more features (budgets, goals, tags, etc.)
4. Customize categories and settings

## Need Help?

- 📖 Full documentation: [SETUP.md](./SETUP.md)
- 🔌 API docs: [apps/api/README.md](./apps/api/README.md)
- 🐛 Check logs: `docker-compose logs -f`

## Security Reminder

Before deploying to production:

- ✅ Change AUTH_PASSWORD to a strong password
- ✅ Generate a new JWT_SECRET (32+ characters)
- ✅ Update DB_PASSWORD
- ✅ Set NODE_ENV=production
- ✅ Enable HTTPS
- ✅ Review CORS settings

---

**You're all set! Happy tracking! 💰**
