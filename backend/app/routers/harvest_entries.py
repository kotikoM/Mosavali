from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
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
    search:    str | None = Query(None),
    db:        AsyncSession = Depends(get_db),
):
    offset = (page - 1) * page_size

    # ── Build filters ─────────────────────────────────────────────
    filters = []
    if search:
        s = search.strip()
        if '-' in s:
            left, right = s.split('-', 1)
            left, right = left.strip(), right.strip()
            try:
                if left and right:
                    filters.append(
                        (HarvestEntry.picker_id  == int(left)) &
                        (HarvestEntry.box_number == int(right))
                    )
                elif left:
                    filters.append(HarvestEntry.picker_id  == int(left))
                elif right:
                    filters.append(HarvestEntry.box_number == int(right))
            except ValueError:
                pass
        else:
            try:
                num = int(s)
                filters.append(
                    (HarvestEntry.picker_id  == num) |
                    (HarvestEntry.box_number == num)
                )
            except ValueError:
                pass

    # ── Count ─────────────────────────────────────────────────────
    count_q = select(func.count()).select_from(HarvestEntry)
    for f in filters:
        count_q = count_q.where(f)
    total = (await db.execute(count_q)).scalar_one()

    # ── Data with joins ───────────────────────────────────────────
    data_q = (
        select(HarvestEntry, Picker, Box, Field)
        .join(Picker, HarvestEntry.picker_id  == Picker.picker_id)
        .join(Box,    HarvestEntry.box_type_id == Box.box_id)
        .join(Field, HarvestEntry.field_id == Field.field_id)
        .order_by(HarvestEntry.scan_date.desc())
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
            "scan_date":         entry.scan_date,
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