# Run verified online backups in a Compose sidecar

Simply Finance uses the SQLite Online Backup API from the application binary to create consistent standalone snapshots while the WAL database remains live. A separate Compose service runs the same image without authentication configuration, ports, or Docker socket access. It backs up immediately and then at most once per UTC hour, retaining the newest ten successful snapshots in an explicit host bind mount.

Each candidate is private, has its session rows securely deleted, passes SQLite integrity and foreign-key checks, and is synced before atomic publication. Retention starts only after publication and affects only application-owned snapshot names. A destination-wide file lock prevents concurrent backup commands. Restores remain explicit and offline into a fresh volume so the former production volume can be preserved until verification succeeds.
