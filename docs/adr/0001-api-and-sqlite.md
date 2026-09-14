# Keep household finances behind a Go API with SQLite

The Go backend owns authentication, financial rules, and persistence behind a versioned HTTP JSON API so future mobile or desktop clients can reuse the same behavior. SQLite avoids a separate database service for this small shared household application; deployment uses a persistent Docker data directory, and backup instructions must account for SQLite's active journal files rather than imply that copying an open database file is always safe.
