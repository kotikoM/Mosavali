CREATE TABLE IF NOT EXISTS harvest_entry (
    fruit_id      INTEGER NOT NULL REFERENCES fruit(fruit_id),
    picker_id     INTEGER NOT NULL REFERENCES picker(picker_id),
    box_number    INTEGER NOT NULL,
    box_type_id   INTEGER NOT NULL REFERENCES box(box_id),
    harvest_date  DATE NOT NULL,
    scan_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_harvest_entry PRIMARY KEY (picker_id, box_number)
);