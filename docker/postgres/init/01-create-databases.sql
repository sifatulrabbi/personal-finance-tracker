SELECT 'CREATE DATABASE finance_tracker_test'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = 'finance_tracker_test'
)
\gexec
