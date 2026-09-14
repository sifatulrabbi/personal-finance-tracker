# Simply Finance

A mobile-first household money tracker. Go owns the API and financial rules. React is the client. SQLite keeps the records in a persistent Docker volume.

## Run with Docker

Requirements: Docker Engine and a current Docker Compose with raw env-file support. Port 47831 must be free. Build locally; no container registry is needed.

```sh
docker build -t simply-finance .
```

Generate a password hash without putting the password in shell history. This example uses Bash's hidden-input prompt:

```sh
bash -c 'read -rsp "Password (12–72 bytes): " password; printf "\n" >&2; printf %s "$password" | docker run --rm -i --entrypoint /app/hash-password simply-finance; unset password'
```

Copy `.env.example` to `.env`. Replace both emails and hash placeholders; remove the second entry if only one user is needed. Keep the JSON on one line and do not add surrounding shell quotes. The raw env-file setting preserves the `$` characters in bcrypt hashes. Password hashes still need protection: keep this file private and out of Git.

```sh
docker compose up -d --build
```

Open `http://localhost:47831`. The first run is empty. Add wallets and opening balances, then set the USD rate before recording USD activity. Credit-card opening balances mean the amount owed, not available credit.

After building an image, run `bash scripts/smoke-docker.sh simply-finance` to verify non-root startup, authenticated writes, restart persistence, and cold backup/restore with disposable synthetic data. This uses port 47834 by default; set `TEST_PORT` to a free alternative if needed.

For hosting, put an HTTPS reverse proxy in front of port 47831. Set `APP_ORIGIN` to the exact public origin without a trailing slash and set `ALLOW_INSECURE_COOKIES=false`. The bundled Compose file binds only to loopback. Do not expose the HTTP development configuration directly to the internet. Restart the container after changing the allowed users or password hashes.

## Backup and restore

The database is `/data/finance.sqlite` inside the container. SQLite can also maintain `-wal` and `-shm` files. For a simple consistent backup, stop writes by stopping the container, then copy the whole data directory:

```sh
docker compose stop finance
mkdir -p backups/household
docker compose cp finance:/data/. backups/household/
docker compose start finance
```

Treat backups as private financial records. Before restoring, stop the service and copy the backup directory into an empty replacement data volume; never mix a database with unrelated journal files. Preserve write access for container UID/GID 10001. Keep the old volume until the restored application has been checked. Do not use `docker compose down -v` unless you intend to delete the records.

## Development and verification

Go 1.27 and Bun 1.3.12 are the local build tools. Docker remains the deployment path; no local database service is required.

```sh
go test -race ./...
go vet ./...
cd web
bun install --frozen-lockfile
bun test src/lib
bun run build
bun --bun playwright install chromium webkit
bun run test:e2e
```

The browser suite builds and starts the actual Go server on port 47833 with a temporary SQLite database and synthetic credentials. It removes its test directory on shutdown. Port 47832 is reserved for the optional Vite development server; 47831 is the application port. Check availability before starting services. On restricted macOS environments, use `GOCACHE=/tmp/simply-finance-go-cache` and allow loopback listeners for HTTP tests.

For local application development, configure `AUTH_USERS_JSON`, `APP_ORIGIN`, and `ALLOW_INSECURE_COOKIES` in your process environment, build the frontend, then run `go run ./cmd/server` from the root. The Go process does not auto-load `.env`. Alternatively, run the whole application through Docker Compose. `DATABASE_PATH`, `WEB_DIR`, and `LISTEN_ADDR` override the defaults when needed.

See `docs/scope.md` for deliberate omissions, `docs/api.md` for request conventions, and `docs/adr/` for lasting design decisions. New agents should begin with `AGENTS.md`.
