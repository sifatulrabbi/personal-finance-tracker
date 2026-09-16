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

Copy `.env.example` to `.env.runtime`. Replace both emails and hash placeholders; remove the second entry if only one user is needed. Keep the JSON on one line and do not add surrounding shell quotes. The separate runtime filename avoids Docker Compose treating bcrypt `$` characters as project-variable substitutions, while the raw env-file setting preserves them when loading the container environment. Password hashes still need protection: keep this file private and out of Git.

Set `BACKUP_DIR` in `.env` to the absolute host path `$HOME/backups/simply-finance` with `$HOME` expanded to its actual value. Compose does not expand `~` in bind-mount paths. On macOS, prepare the private directory before starting Compose:

```sh
mkdir -p "$HOME/backups/simply-finance"
chmod 700 "$HOME/backups/simply-finance"
```

```sh
docker compose build
docker compose run --rm finance migrate
docker compose run --rm finance seed
docker compose up -d
```

Open `http://localhost:47831`. The first run has default categories but no financial records. Add wallets and opening balances, then set the USD rate before recording USD activity. Credit-card opening balances mean the amount owed, not available credit.

The image contains one binary at `/app/simply-finance` with `serve`, `migrate`, `seed`, `backup`, `backup-agent`, `verify-backup`, and `hash-password` commands. Run `docker run --rm simply-finance --help` for help. Migrations and seed definitions are embedded in the binary; no repository checkout or mounted SQL files are needed at runtime. `serve` is the image's default command and never migrates, checks schema versions, or seeds the database. Login creates the user's profile; startup retains session revocation enforcement. Database errors are not automatically repaired.

For upgrades, back up the database and stop the service before running `migrate`, then run `seed` if you want the release's default data, and start the new image. Both commands can be rerun: migrations skip applied versions and seeds insert only missing defaults. Run only one maintenance command at a time. Seeding never imports private wallets or expenses; the private Sheets importer remains separate. Do not mount an empty volume when you intend to upgrade existing records.

Without Compose, use the same volume and image for each deliberate step (the volume name below is an example):

```sh
docker run --rm -v simply-finance-data:/data simply-finance migrate
docker run --rm -v simply-finance-data:/data simply-finance seed
```

After building an image, run `bash scripts/smoke-docker.sh simply-finance` to verify non-root startup, authenticated writes, restart persistence, live backup, session removal, and fresh-volume restore with disposable synthetic data. This uses port 47834 by default; set `TEST_PORT` to a free alternative if needed.

For hosting, put an HTTPS reverse proxy in front of port 47831. Set `APP_ORIGIN` to the exact public origin without a trailing slash and set `ALLOW_INSECURE_COOKIES=false`. The bundled Compose file binds only to loopback. Do not expose the HTTP development configuration directly to the internet. Restart the container after changing the allowed users or password hashes.

Startup rejects HTTPS origins with insecure cookies enabled, and HTTP origins without the explicit development opt-in. `/healthz` checks that SQLite can read application settings within two seconds and returns 503 if unavailable. This is not a write-capacity or disk-space check; monitor free space on the hosting server separately.

## Backup and restore

The `backup` Compose service uses SQLite's Online Backup API against the live WAL database. It creates a backup as soon as the service starts and then creates at most one successful backup per UTC clock hour. Restarting the service in an hour that already has a completed snapshot does not consume another retention slot. The newest ten successful snapshots are retained in `$HOME/backups/simply-finance`; failures and partial files are not counted and never cause completed backups to be pruned.

Each snapshot is a standalone SQLite file named `simply-finance-<UTC timestamp>-<identifier>.sqlite`. Before publication, session rows are securely removed, SQLite integrity and foreign-key checks pass, the file is synced, and it is atomically renamed into place. The source sessions are unchanged. A restored deployment therefore requires every user to log in again.

The sidecar receives no authentication environment, exposes no port, and does not mount the Docker socket. It mounts the data volume read-write because SQLite may require WAL shared-memory access even though the source connection is read-only. A destination lock prevents scheduled and manual backups from overlapping. Run and inspect it with:

```sh
docker compose ps backup
docker compose logs backup
docker compose run --rm backup backup
```

The agent retries failures after five minutes without pruning completed files, while the backup health check becomes unhealthy after roughly two missed hourly runs. Sleeping or powering off the Mac, or stopping Docker Desktop, prevents backups; when service resumes, it makes one snapshot for the current hour rather than fabricating missed snapshots. Monitor free space and the timestamp of the newest file as well as container health.

Treat backups as private financial records. Restore only while both application services are stopped, always into a new empty volume, and never combine a snapshot with WAL or SHM files. The following example selects a snapshot explicitly, preserves the old Compose volume, and cuts over using the supplied restore override:

```sh
export BACKUP_FILE="$HOME/backups/simply-finance/simply-finance-REPLACE_WITH_CHOSEN_SNAPSHOT.sqlite"
export RESTORE_VOLUME="simply-finance-restore-$(date +%Y%m%d%H%M%S)"

docker compose stop finance backup
if docker volume inspect "$RESTORE_VOLUME" >/dev/null 2>&1; then
  echo "Restore volume already exists: $RESTORE_VOLUME" >&2
  exit 1
fi
docker volume create "$RESTORE_VOLUME"
docker run --rm --user 0 --entrypoint /bin/sh \
  -v "$BACKUP_FILE:/restore/finance.sqlite:ro" \
  -v "$RESTORE_VOLUME:/data" simply-finance \
  -c 'set -eu; test -z "$(find /data -mindepth 1 -maxdepth 1 -print -quit)"; cp /restore/finance.sqlite /data/finance.sqlite; chown 10001:10001 /data/finance.sqlite; chmod 600 /data/finance.sqlite'

docker run --rm -v "$RESTORE_VOLUME:/data:ro" simply-finance verify-backup --database /data/finance.sqlite

RESTORE_VOLUME="$RESTORE_VOLUME" docker compose -f compose.yaml -f compose.restore.yaml up -d
```

Log in again, check representative balances and history, and inspect the logs before accepting the restoration. Continue supplying both Compose files and `RESTORE_VOLUME` while running from the replacement volume. To roll back before acceptance, stop that deployment and start normal `compose.yaml` again; the original named volume remains untouched. Never run `docker compose down -v` during this procedure.

These local snapshots protect against database corruption and accidental changes, not loss, theft, ransomware, or failure of the Mac or its disk. Keep an encrypted off-host copy when that risk needs coverage and periodically repeat the restore drill.

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

For local application development, build the binary with `go build -o /tmp/simply-finance ./cmd/simply-finance`. Run `/tmp/simply-finance migrate`, then `/tmp/simply-finance seed`. Configure `AUTH_USERS_JSON`, `APP_ORIGIN`, and `ALLOW_INSECURE_COOKIES` in your process environment, build the frontend, and run `/tmp/simply-finance serve`. The Go process does not auto-load `.env`. Alternatively, run the whole application through Docker Compose. `DATABASE_PATH`, `BACKUP_DIR`, `WEB_DIR`, and `LISTEN_ADDR` override the defaults when needed. Database commands and `verify-backup` accept `--database`; backup creation commands also accept `--destination` and `--retain`. Database maintenance, backup, and password hashing do not require authentication configuration.

See `docs/scope.md` for deliberate omissions, `docs/api.md` for request conventions, and `docs/adr/` for lasting design decisions. New agents should begin with `AGENTS.md`.
