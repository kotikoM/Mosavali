CREATE TABLE IF NOT EXISTS box (
    box_id          SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    empty_weight_kg NUMERIC(6, 3) NOT NULL,
    full_weight_kg  NUMERIC(6, 3) NOT NULL,
    net_weight_kg   NUMERIC(6, 3) GENERATED ALWAYS AS (full_weight_kg - empty_weight_kg) STORED,
    description     TEXT
);