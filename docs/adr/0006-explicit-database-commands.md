# Separate serving, migration, and seeding

One Cobra binary exposes `serve`, `migrate`, `seed`, and `hash-password`. Docker packages this binary with the frontend and defaults to `serve`. Migrations and seed SQL are embedded separately so operators can prepare a database using only the release image, without Go or a repository checkout. Maintenance commands do not require login credentials.

`finance.Open` opens an existing database without migrating, seeding, or checking schema versions. Only `migrate` may create a database and apply pending schema versions. `seed` runs repeatable default-data inserts in one transaction; it does not alter the schema or overwrite matching categories. It has no applied-version ledger: each seed definition must remain safe to rerun. Future schema evolution must keep the active seed definitions compatible. Tests explicitly migrate and seed disposable databases.

Existing migrations 001–006 are retained as applied history, including their required settings and Others initialization and historical-data transformations. New default expense categories belong to the separate seed pipeline, not a migration. Private wallet details and spreadsheet imports are not application defaults and remain outside the image. User profiles are created at login, not during server initialization; session revocation reconciliation remains an authentication startup operation.

Operators stop writers, back up the database, run maintenance commands sequentially, and then start the server. No startup hook prepares or repairs the schema. The existing database health endpoint remains a runtime readiness check, not a migration or schema-version gate.
