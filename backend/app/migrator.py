import os
import psycopg2
import logging

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = "/app/migrations"


def run_migrations():
    url = os.getenv("DATABASE_URL").replace("+asyncpg", "")
    conn = psycopg2.connect(url)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name       TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    cur.execute("SELECT name FROM schema_migrations")
    applied = {row[0] for row in cur.fetchall()}

    files = sorted(f for f in os.listdir(MIGRATIONS_DIR) if f.endswith(".sql"))
    for filename in files:
        name = filename.replace(".sql", "")
        if name not in applied:
            logger.info(f"Applying: {filename}")
            with open(f"{MIGRATIONS_DIR}/{filename}") as f:
                cur.execute(f.read())
            cur.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (name,))
            logger.info(f"Done: {filename}")
        else:
            logger.info(f"Skipping: {filename}")

    conn.commit()
    cur.close()
    conn.close()