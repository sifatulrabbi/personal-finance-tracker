#!/usr/bin/env bash
set -euo pipefail

image="${1:-simply-finance:local}"
port="${TEST_PORT:-47834}"
prefix="simply-finance-smoke-$$"
temporary="$(mktemp -d)"
source_volume="$prefix-source"
restore_volume="$prefix-restore"
container="$prefix-app"
restored="$prefix-restored"
backup_dir="$temporary/backups"
cleanup() {
  docker rm -f "$container" "$restored" >/dev/null 2>&1 || true
  docker volume rm "$source_volume" "$restore_volume" >/dev/null 2>&1 || true
  rm -rf "$temporary"
}
trap cleanup EXIT
if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Test port $port is occupied. Set TEST_PORT to a free port." >&2
  exit 1
fi
hash="$(printf %s test-household-password | docker run --rm -i "$image" hash-password)"
users="[{\"email\":\"test@example.test\",\"password_hash\":\"$hash\",\"name\":\"Synthetic test\"}]"
docker volume create "$source_volume" >/dev/null
docker volume create "$restore_volume" >/dev/null
mkdir -m 700 "$backup_dir"
docker run --rm -v "$source_volume:/data" "$image" migrate
docker run --rm -v "$source_volume:/data" "$image" seed
docker run --rm -v "$source_volume:/data" "$image" migrate
docker run --rm -v "$source_volume:/data" "$image" seed
start() {
  docker run -d --name "$1" -p "127.0.0.1:$port:47831" \
    -e "AUTH_USERS_JSON=$users" -e "APP_ORIGIN=http://127.0.0.1:$port" -e ALLOW_INSECURE_COOKIES=true \
    -v "$2:/data" "$image" >/dev/null
}
ready() {
  for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:$port/healthz" >/dev/null 2>&1; then return; fi
    sleep 1
  done
  echo "Container did not become ready" >&2
  exit 1
}
request() {
  curl -fsS -b "$temporary/cookies" -c "$temporary/cookies" \
    -H 'Content-Type: application/json' -H 'X-CSRF-Protection: 1' \
    -H "Idempotency-Key: $3" -X "$1" "http://127.0.0.1:$port/api/v1$2" ${4:+--data "$4"}
}
start "$container" "$source_volume"
ready
test "$(docker exec "$container" id -u)" = 10001
curl -fsS "http://127.0.0.1:$port/" | grep -q 'Simply Finance'
request POST /login login '{"email":"test@example.test","password":"test-household-password"}' >/dev/null
wallet="$(request POST /wallets wallet '{"name":"Backup test","type":"physical","opening_balance":"1000"}')"
wallet_id="$(printf %s "$wallet" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
request POST /transactions expense "{\"kind\":\"expense\",\"wallet_id\":\"$wallet_id\",\"amount\":\"125.50\",\"date\":\"2026-09-14\"}" >/dev/null
request GET /wallets read | grep -q '874.50'
docker restart "$container" >/dev/null
ready
request GET /wallets read | grep -q '874.50'
docker run --rm -v "$source_volume:/data" -v "$backup_dir:/backups" "$image" backup --destination /backups >/dev/null
backup_file="$(find "$backup_dir" -maxdepth 1 -type f -name 'simply-finance-*.sqlite' -print -quit)"
test -n "$backup_file"
docker run --rm -v "$backup_file:/backup/finance.sqlite:ro" "$image" verify-backup --database /backup/finance.sqlite >/dev/null
docker stop "$container" >/dev/null
docker run --rm --user 0 --entrypoint /bin/sh -v "$backup_file:/restore/finance.sqlite:ro" -v "$restore_volume:/data" "$image" -c 'set -eu; test -z "$(find /data -mindepth 1 -maxdepth 1 -print -quit)"; cp /restore/finance.sqlite /data/finance.sqlite; chown 10001:10001 /data/finance.sqlite; chmod 600 /data/finance.sqlite'
start "$restored" "$restore_volume"
ready
if request GET /wallets old-session >/dev/null 2>&1; then
  echo 'Restored backup unexpectedly retained a login session.' >&2
  exit 1
fi
request POST /login restored-login '{"email":"test@example.test","password":"test-household-password"}' >/dev/null
request GET /wallets read | grep -q '874.50'
echo 'PASS: non-root container, frontend, authenticated writes, restart persistence, live backup, session scrubbing, and fresh-volume restore.'
