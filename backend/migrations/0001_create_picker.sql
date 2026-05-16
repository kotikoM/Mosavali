CREATE TABLE IF NOT EXISTS picker (
    picker_id    SERIAL PRIMARY KEY,
    national_id  TEXT NOT NULL UNIQUE,
    first_name   TEXT NOT NULL,
    last_name    TEXT NOT NULL,
    origin_place TEXT,
    bank_info    TEXT,
    note         TEXT
);