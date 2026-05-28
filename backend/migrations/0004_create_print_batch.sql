CREATE TABLE IF NOT EXISTS print_batch (
    batch_id        SERIAL PRIMARY KEY,
    picker_id       INTEGER NOT NULL REFERENCES picker(picker_id),
    box_number_from INTEGER NOT NULL,
    box_number_to   INTEGER NOT NULL,
    quantity        INTEGER GENERATED ALWAYS AS (box_number_to - box_number_from + 1) STORED,
    printed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_box_range CHECK (box_number_to >= box_number_from),
    CONSTRAINT uq_batch_range UNIQUE (picker_id, box_number_from)
);