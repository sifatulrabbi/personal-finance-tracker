-- ADR 0015: a category rename is checked against the version the writer read.
ALTER TABLE categories ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
