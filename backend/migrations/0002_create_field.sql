CREATE TABLE IF NOT EXISTS field  (
    field_id     SERIAL PRIMARY KEY,
    field_name   TEXT NOT NULL,
    description  TEXT
);