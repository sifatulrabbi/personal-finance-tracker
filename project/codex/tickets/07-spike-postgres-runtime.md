# T-003 Spike: Bun SQL + Postgres Runtime Assumptions

## Decision

Use PostgreSQL as the project database direction, with Bun's built-in SQL client as the application and script client. Local development uses Docker Compose Postgres. Hosted environments such as Vercel use a remote Postgres connection through `DATABASE_URL`.

## Local Development

- Developers run Postgres through `docker-compose.dev.yml`.
- The app connects to `finance_tracker_dev`.
- Integration tests connect to `finance_tracker_test`.
- Bun SQL is used directly in the app, repositories, migrations, and scripts.

## Hosted Environments

- Vercel can connect to remote Postgres without the filesystem durability problems that blocked file-backed SQLite.
- Production should use `DATABASE_URL` from the hosting environment.
- No local filesystem persistence assumption remains in the design.

## What T-004 Should Build

- One cached Bun SQL connection module for app runtime usage.
- A dedicated connection path for tests and scripts.
- SQL-first migrations with checksum tracking.
- Shared helpers for UUID generation, UTC timestamps, and money conversion.
- DI-friendly repository and service factories that accept `{ db, ...rest }`.

## Notes

- The codebase should not build a wrapper abstraction around Bun SQL.
- The testability strategy is dependency injection through factory context, not a custom database adapter contract.
