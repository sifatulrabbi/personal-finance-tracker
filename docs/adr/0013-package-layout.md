# Split the backend into rules, use cases, storage, authentication, and transport

The `finance` package was the domain model, the application service, and the SQLite repository at once, and `httpapi` also owned credentials, sessions, and login throttling. Rules lived inside SQL transaction closures, so a rule such as "a same-currency transfer receives what it sends" could only be tested through a database, and a second client could not reuse sign-in without HTTP.

The backend is now six packages, each depending only on the ones listed before it:

- `internal/money`: amounts and rates as integers; parse, format, and convert. Pure.
- `internal/ledger`: the records (wallets, transactions, schedules, bills, targets) and the rules about them, as pure functions over plain structs: which inputs are valid and in which order they are checked, each record's balance effects (including a debit card posting to its bank wallet), corrections, voids, adjustments, bill payment, recurrence dates with anchor clamping, target inheritance, and monthly shares. It also defines the typed domain errors. Table and fuzz tests cover it without a database.
- `internal/app`: the use cases. Each one loads what a rule needs through the storage port, applies the rule, and writes the result in the same transaction. It owns request-key fingerprints, version checks, cursors, and paging. The clock and the household's location are passed in through `app.Config`; nothing reads a global time zone.
- `internal/sqlite`: the storage adapter. It opens the writer and reader pools, applies the embedded migrations and seeds, maps records to rows and typed columns, keeps the request-key table, and stores users and sessions. It has no clock; callers pass instants.
- `internal/auth`: allowed accounts from `AUTH_USERS_JSON`, password checks with the dummy hash, the login limiter (ADR 0009), and session creation, lookup, and revocation. It takes the client's address and the session token as strings and knows nothing about HTTP.
- `internal/httpapi`: routes, request decoding, the error envelope (ADR 0008), cookies, CSRF and origin checks, the client address behind trusted proxies, and the access log.

`cmd/simply-finance` wires them: it loads Asia/Dhaka, opens the store, and passes the store to `app.New` and `auth.New` and both services to `httpapi.New`. `internal/apptest` does the same wiring over a migrated temporary database for tests in any package.

There are two interfaces, one per real integration boundary: `app.Store` with its `app.Tx` (the record access available inside one transaction), and `auth.Store` (users and sessions). The SQLite adapter implements both. We chose one wide transaction interface over one interface per record type because every use case runs in exactly one transaction and there is exactly one implementation; smaller interfaces would add names without adding a seam. We deliberately have no in-memory implementation: use cases are proven against SQLite, and pure rules are proven in `ledger` without any store. A test in each of `app` and `sqlite` rejects transaction code that opens a second transaction or uses an outer request context, since the single writer connection would wait for itself.

The record structs in `ledger` remain both the JSON wire format and the stored revision payload, as before. Separating a wire DTO, a domain type, and a versioned stored format is a later, deliberate change; this split changes no route, status, field name, or stored byte.
