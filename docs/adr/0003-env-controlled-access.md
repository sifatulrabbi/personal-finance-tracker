# Separate login permission from database user profiles

Allowed emails and password hashes are configured through a JSON array in an environment variable, while SQLite stores stable user identities and display names for attribution. Database profiles never grant access on their own; removing an email or changing its configured password hash invalidates prior sessions. This deliberately replaces registration and an external identity provider for a controlled household deployment.
