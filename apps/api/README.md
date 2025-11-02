# Finance Tracker API

Backend API server for the Finance Tracker application built with Bun, Hono, and PostgreSQL.

## Features

- **Authentication**: Single-user JWT-based authentication
- **Accounts Management**: Track multiple accounts (checking, savings, credit cards, etc.)
- **Transactions**: Income, expenses, and transfers with category support
- **Database**: PostgreSQL with Drizzle ORM
- **Validation**: Zod schema validation
- **API Documentation**: RESTful API with clear response formats

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **Authentication**: JWT (jose)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0.0+
- [Docker](https://www.docker.com/) (for PostgreSQL)
- Make (optional, for convenience commands)

### Installation

1. Install dependencies:

```bash
bun install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Update `.env` with your configuration (especially change default passwords!)

### Database Setup

1. Start PostgreSQL with Docker:

```bash
# Using Docker Compose
docker-compose up -d postgres

# Or using Make
make up
```

2. Generate migrations:

```bash
bun run db:generate
```

3. Run migrations:

```bash
bun run db:migrate
```

4. Seed the database with initial data:

```bash
bun run db:seed
```

This will create:

- Default user with credentials from `.env`
- Default currencies (USD, EUR, GBP, etc.)
- Default income and expense categories

### Development

Start the development server with hot reload:

```bash
bun run dev
```

The API will be available at `http://localhost:3001`

### Production

Build and start:

```bash
bun run build
bun run start
```

## API Endpoints

### Authentication

- `POST /api/auth/login` - Login with username and password
- `GET /api/auth/me` - Get current user info (requires authentication)

### Accounts

All account endpoints require authentication.

- `GET /api/accounts` - Get all accounts
- `GET /api/accounts/balances` - Get total balances by currency
- `GET /api/accounts/:id` - Get account by ID
- `POST /api/accounts` - Create new account
- `PATCH /api/accounts/:id` - Update account
- `DELETE /api/accounts/:id` - Delete account

### Transactions

All transaction endpoints require authentication.

- `GET /api/transactions` - Get all transactions (with optional filters)
- `GET /api/transactions/summary` - Get summary for date range
- `GET /api/transactions/:id` - Get transaction by ID
- `POST /api/transactions` - Create new transaction
- `PATCH /api/transactions/:id` - Update transaction
- `DELETE /api/transactions/:id` - Delete transaction

Query parameters for `GET /api/transactions`:

- `limit` - Number of results (default: 100)
- `offset` - Pagination offset (default: 0)
- `startDate` - Filter by start date (ISO 8601)
- `endDate` - Filter by end date (ISO 8601)
- `accountId` - Filter by account
- `categoryId` - Filter by category
- `type` - Filter by type (income/expense/transfer)

## API Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response

```json
{
  "error": "Error Type",
  "message": "Error description",
  "details": { ... } // Optional, for validation errors
}
```

## Authentication

The API uses JWT tokens for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Database Schema

The application uses the following main tables:

- `users` - User accounts
- `accounts` - Financial accounts (checking, savings, etc.)
- `categories` - Transaction categories
- `transactions` - Income, expenses, and transfers
- `transaction_splits` - Split transactions across categories
- `budgets` - Budget tracking
- `goals` - Financial goals
- `tags` - Custom transaction tags
- `recurring_transactions` - Recurring transaction templates
- `currencies` - Supported currencies
- `exchange_rates` - Currency exchange rates

## Scripts

- `bun run dev` - Start development server with hot reload
- `bun run build` - Build for production
- `bun run start` - Start production server
- `bun run type-check` - Run TypeScript type checking
- `bun run db:generate` - Generate database migrations
- `bun run db:migrate` - Run database migrations
- `bun run db:seed` - Seed database with initial data
- `bun run db:studio` - Open Drizzle Studio (database GUI)
- `bun run db:push` - Push schema changes directly (for development)

## Environment Variables

See `.env.example` for all available environment variables.

Key variables:

- `DATABASE_URL` - PostgreSQL connection string
- `AUTH_USERNAME` - Single user username
- `AUTH_PASSWORD` - Single user password
- `JWT_SECRET` - Secret key for JWT signing (min 32 characters)
- `PORT` - API server port (default: 3001)
- `CORS_ORIGIN` - Allowed CORS origin (default: http://localhost:3000)

## Security Notes

- Always change default credentials in production
- Use a strong, random JWT_SECRET (minimum 32 characters)
- Keep .env file secure and never commit it to version control
- Use HTTPS in production
- Regularly update dependencies

## License

Private
