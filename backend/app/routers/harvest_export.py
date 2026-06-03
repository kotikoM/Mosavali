from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from collections import defaultdict

from app.database import get_db
from app.entities.harvest_entry import HarvestEntry
from app.entities.picker import Picker
from app.entities.box import Box
from app.entities.field import Field

router = APIRouter(prefix="/harvest", tags=["harvest-export"])


@router.get("/export/picker-detail")
async def export_picker_detail(db: AsyncSession = Depends(get_db)):

    rows = (await db.execute(
        select(HarvestEntry, Picker, Box, Field)
        .join(Picker, HarvestEntry.picker_id  == Picker.picker_id)
        .join(Box,    HarvestEntry.box_type_id == Box.box_id)
        .join(Field,  HarvestEntry.field_id    == Field.field_id)
        .order_by(Picker.last_name, Picker.first_name, HarvestEntry.harvest_date)
    )).all()

    # ── Group by picker ───────────────────────────────────────────
    picker_meta:    dict[int, dict]              = {}
    picker_entries: dict[int, list]              = defaultdict(list)
    picker_boxes:   dict[int, dict[str, dict]]   = defaultdict(dict)

    for entry, picker, box, field in rows:
        pid = picker.picker_id

        if pid not in picker_meta:
            picker_meta[pid] = {
                "picker_id":    pid,
                "first_name":   picker.first_name,
                "last_name":    picker.last_name,
                "national_id":  picker.national_id,
                "origin_place": picker.origin_place,
                "phone":        picker.phone,
            }

        # Box type summary
        if box.name not in picker_boxes[pid]:
            picker_boxes[pid][box.name] = {
                "box_name":      box.name,
                "net_weight_kg": float(box.net_weight_kg),
                "count":         0,
            }
        picker_boxes[pid][box.name]["count"] += 1

        # Individual entry
        picker_entries[pid].append({
            "barcode":       f"{str(entry.picker_id).zfill(4)}-{str(entry.box_number).zfill(4)}",
            "box_name":      box.name,
            "net_weight_kg": float(box.net_weight_kg),
            "field_name":    field.field_name,
            "harvest_date":  str(entry.harvest_date),
        })

    # ── Assemble response ─────────────────────────────────────────
    result = []
    for pid, meta in picker_meta.items():
        box_summary = list(picker_boxes[pid].values())
        total_boxes = sum(b["count"] for b in box_summary)
        total_kg    = sum(b["count"] * b["net_weight_kg"] for b in box_summary)

        result.append({
            **meta,
            "total_boxes":      total_boxes,
            "total_kg":         round(total_kg, 3),
            "box_type_summary": box_summary,
            "entries":          picker_entries[pid],
        })

    return result