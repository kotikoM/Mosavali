CREATE TABLE IF NOT EXISTS fruit (
    fruit_id     SERIAL PRIMARY KEY,
    fruit_type   TEXT NOT NULL,
    variety_name TEXT NOT NULL
);