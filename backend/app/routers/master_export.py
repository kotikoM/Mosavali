from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.entities.harvest_entry import HarvestEntry
from app.entities.picker import Picker
from app.entities.box import Box
from app.entities.field import Field
from app.entities.print_batch import PrintBatch

router = APIRouter(prefix="/export", tags=["master-export"])


@router.get("/master")
async def master_export(db: AsyncSession = Depends(get_db)):

    # ── Sheet 1: Daily harvest all-time (picker × day × box type) ─
    s1_q = (
        select(
            Picker.picker_id,
            Picker.first_name,
            Picker.last_name,
            Picker.national_id,
            Picker.phone,
            Picker.bank_info,
            Picker.origin_place,
            HarvestEntry.harvest_date,
            Box.box_id,
            Box.name.label("box_name"),
            Box.net_weight_kg,
            func.count(HarvestEntry.box_number).label("box_count"),
            func.sum(Box.net_weight_kg).label("daily_kg"),
        )
        .join(HarvestEntry, HarvestEntry.picker_id == Picker.picker_id)
        .join(Box, Box.box_id == HarvestEntry.box_type_id)
        .group_by(
            Picker.picker_id, Picker.first_name, Picker.last_name,
            Picker.national_id, Picker.phone, Picker.bank_info, Picker.origin_place,
            HarvestEntry.harvest_date, Box.box_id, Box.name, Box.net_weight_kg,
        )
        .order_by(Picker.picker_id, HarvestEntry.harvest_date, Box.box_id)
    )
    s1_rows = (await db.execute(s1_q)).all()

    pickers_s1: dict[int, dict] = {}
    for row in s1_rows:
        if row.picker_id not in pickers_s1:
            pickers_s1[row.picker_id] = {
                "picker_id":       row.picker_id,
                "first_name":      row.first_name,
                "last_name":       row.last_name,
                "national_id":     row.national_id,
                "phone":           row.phone,
                "bank_info":       row.bank_info,
                "origin_place":    row.origin_place,
                "days":            {},
                "total_kg":        0.0,
                "total_boxes":     0,
                "total_box_types": {},
            }
        day_str = str(row.harvest_date)
        if day_str not in pickers_s1[row.picker_id]["days"]:
            pickers_s1[row.picker_id]["days"][day_str] = {"kg": 0.0, "box_types": {}}
        pickers_s1[row.picker_id]["days"][day_str]["kg"] += float(row.daily_kg)
        pickers_s1[row.picker_id]["days"][day_str]["box_types"][row.box_name] = {
            "count":         row.box_count,
            "net_weight_kg": float(row.net_weight_kg),
            "total_kg":      round(float(row.daily_kg), 3),
        }
        pickers_s1[row.picker_id]["total_kg"]    += float(row.daily_kg)
        pickers_s1[row.picker_id]["total_boxes"] += row.box_count
        pickers_s1[row.picker_id]["total_box_types"].setdefault(row.box_name, 0)
        pickers_s1[row.picker_id]["total_box_types"][row.box_name] += row.box_count

    for p in pickers_s1.values():
        p["total_kg"] = round(p["total_kg"], 3)
        for day in p["days"].values():
            day["kg"] = round(day["kg"], 3)

    picker_box_stats = list(pickers_s1.values())

    # ── Sheet 2: Sticker detail (picker summary + every entry) ────
    s2_q = (
        select(HarvestEntry, Picker, Box, Field)
        .join(Picker, HarvestEntry.picker_id  == Picker.picker_id)
        .join(Box,    HarvestEntry.box_type_id == Box.box_id)
        .join(Field,  HarvestEntry.field_id    == Field.field_id)
        .order_by(Picker.last_name, Picker.first_name, HarvestEntry.harvest_date)
    )
    s2_rows = (await db.execute(s2_q)).all()

    picker_meta:     dict[int, dict]             = {}
    picker_entries:  dict[int, list]             = {}
    picker_boxes_s2: dict[int, dict[str, dict]]  = {}

    for entry, picker, box, field in s2_rows:
        pid = picker.picker_id
        if pid not in picker_meta:
            picker_meta[pid]     = {
                "picker_id":    pid,
                "first_name":   picker.first_name,
                "last_name":    picker.last_name,
                "national_id":  picker.national_id,
                "origin_place": picker.origin_place,
                "phone":        picker.phone,
            }
            picker_entries[pid]  = []
            picker_boxes_s2[pid] = {}

        if box.name not in picker_boxes_s2[pid]:
            picker_boxes_s2[pid][box.name] = {
                "box_name":      box.name,
                "net_weight_kg": float(box.net_weight_kg),
                "count":         0,
            }
        picker_boxes_s2[pid][box.name]["count"] += 1
        picker_entries[pid].append({
            "barcode":       f"{str(entry.picker_id).zfill(4)}-{str(entry.box_number).zfill(4)}",
            "box_name":      box.name,
            "net_weight_kg": float(box.net_weight_kg),
            "field_name":    field.field_name,
            "harvest_date":  str(entry.harvest_date),
        })

    picker_detail = []
    for pid, meta in picker_meta.items():
        box_summary = list(picker_boxes_s2[pid].values())
        total_boxes = sum(b["count"] for b in box_summary)
        total_kg    = sum(b["count"] * b["net_weight_kg"] for b in box_summary)
        picker_detail.append({
            **meta,
            "total_boxes":      total_boxes,
            "total_kg":         round(total_kg, 3),
            "box_type_summary": box_summary,
            "entries":          picker_entries[pid],
        })

    # ── Sheet 3: Fields ───────────────────────────────────────────
    s3_q = (
        select(
            Field.field_id,
            Field.field_name,
            Field.description,
            func.count(HarvestEntry.box_number).label("total_boxes"),
            func.sum(Box.net_weight_kg).label("total_kg"),
        )
        .join(HarvestEntry, HarvestEntry.field_id == Field.field_id, isouter=True)
        .join(Box, Box.box_id == HarvestEntry.box_type_id, isouter=True)
        .group_by(Field.field_id, Field.field_name, Field.description)
        .order_by(Field.field_id)
    )
    fields = [
        {
            "field_id":    r.field_id,
            "field_name":  r.field_name,
            "description": r.description,
            "total_boxes": r.total_boxes or 0,
            "total_kg":    round(float(r.total_kg or 0), 3),
        }
        for r in (await db.execute(s3_q)).all()
    ]

    # ── Sheet 4: Box types ────────────────────────────────────────
    s4_q = (
        select(
            Box.box_id,
            Box.name,
            Box.empty_weight_kg,
            Box.full_weight_kg,
            Box.net_weight_kg,
            Box.description,
            func.count(HarvestEntry.box_number).label("total_scanned"),
        )
        .join(HarvestEntry, HarvestEntry.box_type_id == Box.box_id, isouter=True)
        .group_by(
            Box.box_id, Box.name, Box.empty_weight_kg,
            Box.full_weight_kg, Box.net_weight_kg, Box.description,
        )
        .order_by(Box.box_id)
    )
    boxes = [
        {
            "box_id":          r.box_id,
            "name":            r.name,
            "empty_weight_kg": float(r.empty_weight_kg),
            "full_weight_kg":  float(r.full_weight_kg),
            "net_weight_kg":   float(r.net_weight_kg),
            "description":     r.description,
            "total_scanned":   r.total_scanned or 0,
        }
        for r in (await db.execute(s4_q)).all()
    ]

    # ── Sheet 5: Print batches ────────────────────────────────────
    s5_q = (
        select(PrintBatch, Picker)
        .join(Picker, PrintBatch.picker_id == Picker.picker_id)
        .order_by(PrintBatch.printed_at.desc())
    )
    print_batches = [
        {
            "batch_id":        batch.batch_id,
            "picker_id":       batch.picker_id,
            "picker_name":     f"{picker.first_name} {picker.last_name}",
            "national_id":     picker.national_id,
            "box_number_from": batch.box_number_from,
            "box_number_to":   batch.box_number_to,
            "quantity":        batch.quantity,
            "printed_at":      batch.printed_at.isoformat(),
        }
        for batch, picker in (await db.execute(s5_q)).all()
    ]

    return {
        "picker_box_stats": picker_box_stats,
        "picker_detail":    picker_detail,
        "fields":           fields,
        "boxes":            boxes,
        "print_batches":    print_batches,
    }