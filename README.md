# Simply Finance

A mobile-first household money tracker. Go owns the API and financial rules. React is the client. SQLite keeps the records in a persistent Docker volume.

## Run with Docker

Requirements: Docker Engine and a current Docker Compose with raw env-file support. Port 47831 must be free. Build locally; no container registry is needed.

```sh
docker build -t simply-finance .
```

Generate a password hash without putting the password in shell history. This example uses Bash's hidden-input prompt:

```sh
bash -c 'read -rsp "Password (12–72 bytes): " password; printf "\n" >&2; printf %s "$password" | docker run --rm -i simply-finance hash-password; unset password'
```

Copy `.env.example` to `.env`. Replace both emails and hash placeholders; remove the second entry if only one user is needed. Keep the JSON on one line and do not add surrounding shell quotes. The raw env-file setting preserves the `$` characters in bcrypt hashes. Password hashes still need protection: keep this file private and out of Git.

```sh
docker compose build finance
docker compose run --rm finance migrate
docker compose run --rm finance seed
docker compose up -d finance
```

Open `http://localhost:47831`. The first run has default categories but no financial records. Add wallets and opening balances, then set the USD rate before recording USD activity. Credit-card opening balances mean the amount owed, not available credit.

The image contains one binary at `/app/simply-finance` with `serve`, `migrate`, `seed`, and `hash-password` commands. Run `docker run --rm simply-finance --help` for help. Migrations and seed definitions are embedded in the binary; no repository checkout or mounted SQL files are needed at runtime. `serve` is the image's default command and never migrates, checks schema versions, or seeds the database. Login creates the user's profile; startup retains session revocation enforcement. Database errors are not automatically repaired.

For upgrades, back up the database and stop the service before running `migrate`, then run `seed` if you want the release's default data, and start the new image. Both commands can be rerun: migrations skip applied versions and seeds insert only missing defaults. Run only one maintenance command at a time. Seeding never imports private wallets or expenses; the private Sheets importer remains separate. Do not mount an empty volume when you intend to upgrade existing records.

Without Compose, use the same volume and image for each deliberate step (the volume name below is an example):

```sh
docker run --rm -v simply-finance-data:/data simply-finance migrate
docker run --rm -v simply-finance-data:/data simply-finance seed
```

After building an image, run `bash scripts/smoke-docker.sh simply-finance` to verify non-root startup, authenticated writes, restart persistence, and cold backup/restore with disposable synthetic data. This uses port 47834 by default; set `TEST_PORT` to a free alternative if needed.

For hosting, put an HTTPS reverse proxy in front of port 47831. Set `APP_ORIGIN` to the exact public origin without a trailing slash and set `ALLOW_INSECURE_COOKIES=false`. The bundled Compose file binds only to loopback. Do not expose the HTTP development configuration directly to the internet. Restart the container after changing the allowed users or password hashes.

Startup rejects HTTPS origins with insecure cookies enabled, and HTTP origins without the explicit development opt-in. `/healthz` checks that SQLite can read application settings within two seconds and returns 503 if unavailable. This is not a write-capacity or disk-space check; monitor free space on the hosting server separately.

## Backup and restore

The database is `/data/finance.sqlite` inside the container. SQLite can also maintain `-wal` and `-shm` files. For a simple consistent backup, stop writes by stopping the container, then copy the whole data directory:

```sh
docker compose stop finance
mkdir -p backups/household
docker compose cp finance:/data/. backups/household/
docker compose start finance
```

Treat backups as private financial records. Before restoring, stop the service and copy the backup directory into an empty replacement data volume; never mix a database with unrelated journal files. Preserve write access for container UID/GID 10001. Keep the old volume until the restored application has been checked. Do not use `docker compose down -v` unless you intend to delete the records.

Before relying on this for real records, schedule backups at an interval matching the amount of data you can afford to lose. Keep an encrypted copy off the hosting server and verify restoration into a separate volume. A same-server backup does not protect against loss of the server or its disk. Backup scheduling and the remote destination are hosting responsibilities; the application does not send your records to a backup provider.

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

For local application development, build the binary with `go build -o /tmp/simply-finance ./cmd/simply-finance`. Run `/tmp/simply-finance migrate`, then `/tmp/simply-finance seed`. Configure `AUTH_USERS_JSON`, `APP_ORIGIN`, and `ALLOW_INSECURE_COOKIES` in your process environment, build the frontend, and run `/tmp/simply-finance serve`. The Go process does not auto-load `.env`. Alternatively, run the whole application through Docker Compose. `DATABASE_PATH`, `WEB_DIR`, and `LISTEN_ADDR` override the defaults when needed. The `serve`, `migrate`, and `seed` commands also accept `--database /absolute/path/finance.sqlite`, which takes precedence over `DATABASE_PATH`. Database maintenance and password hashing do not require authentication configuration.

See `docs/scope.md` for deliberate omissions, `docs/api.md` for request conventions, and `docs/adr/` for lasting design decisions. New agents should begin with `AGENTS.md`.
