from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, cast, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.entities.harvest_entry import HarvestEntry
from app.entities.picker import Picker
from app.entities.box import Box
from app.entities.field import Field


router = APIRouter(prefix="/harvest", tags=["harvest-entries"])


@router.get("/entries")
async def get_entries(
    page:      int        = Query(1, ge=1),
    page_size: int        = Query(25, ge=1, le=100),
    picker_id: int | None = Query(None),
    box_prefix: str | None = Query(None),
    db:        AsyncSession = Depends(get_db),
):
    offset = (page - 1) * page_size

    filters = []

    if picker_id is not None:
        filters.append(HarvestEntry.picker_id == picker_id)

    if box_prefix:
        p      = box_prefix.strip()
        padded = func.lpad(cast(HarvestEntry.box_number, String), 4, '0')
        filters.append(padded.like(f'{p}%'))

    # ── Count ──────────────────────────────────────────────────────
    count_q = select(func.count()).select_from(HarvestEntry)
    for f in filters:
        count_q = count_q.where(f)
    total = (await db.execute(count_q)).scalar_one()

    # ── Data with joins ────────────────────────────────────────────
    data_q = (
        select(HarvestEntry, Picker, Box, Field)
        .join(Picker, HarvestEntry.picker_id   == Picker.picker_id)
        .join(Box,    HarvestEntry.box_type_id  == Box.box_id)
        .join(Field,  HarvestEntry.field_id     == Field.field_id)
        .order_by(HarvestEntry.scanned_at.desc())
    )
    for f in filters:
        data_q = data_q.where(f)

    rows = (await db.execute(data_q.offset(offset).limit(page_size))).all()

    items = [
        {
            "field_id":          entry.field_id,
            "field_name":        field.field_name,
            "picker_id":         entry.picker_id,
            "box_number":        entry.box_number,
            "box_type_id":       entry.box_type_id,
            "harvest_date":      entry.harvest_date,
            "scanned_at":        entry.scanned_at,
            "picker_first_name": picker.first_name,
            "picker_last_name":  picker.last_name,
            "box_name":          box.name,
            "box_net_weight_kg": float(box.net_weight_kg),
        }
        for entry, picker, box, field in rows
    ]

    return {
        "items":     items,
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "pages":     (total + page_size - 1) // page_size,
    }