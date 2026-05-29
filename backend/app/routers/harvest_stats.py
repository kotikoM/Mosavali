from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from app.database import get_db
from app.entities.harvest_entry import HarvestEntry
from app.entities.picker import Picker
from app.entities.box import Box
from app.entities.field import Field
from app.schemas.harvest_entry import (
    DailyStatEntry,
    DailyStatsResponse,
)

router = APIRouter(prefix="/harvest", tags=["harvest-stats"])


@router.get("/stats", response_model=DailyStatsResponse)
async def get_daily_stats(
    from_date: date | None = None,
    to_date:   date | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(
            HarvestEntry.harvest_date,
            HarvestEntry.box_type_id,
            func.count().label("count"),
        )
        .group_by(HarvestEntry.harvest_date, HarvestEntry.box_type_id)
        .order_by(HarvestEntry.harvest_date)
    )
    if from_date:
        query = query.where(HarvestEntry.harvest_date >= from_date)
    if to_date:
        query = query.where(HarvestEntry.harvest_date <= to_date)

    result = await db.execute(query)
    rows   = result.all()
    stats  = [
        DailyStatEntry(harvest_date=r.harvest_date, box_type_id=r.box_type_id, count=r.count)
        for r in rows
    ]
    return DailyStatsResponse(stats=stats, total=sum(s.count for s in stats))


@router.get("/overview")
async def get_overview(db: AsyncSession = Depends(get_db)):
    picker_result = await db.execute(select(func.count()).select_from(Picker))
    total_pickers = picker_result.scalar() or 0

    scan_result   = await db.execute(select(func.count()).select_from(HarvestEntry))
    total_scanned = scan_result.scalar() or 0

    kg_result = await db.execute(
        select(func.sum(Box.net_weight_kg))
        .join(HarvestEntry, HarvestEntry.box_type_id == Box.box_id)
    )
    total_kg = float(kg_result.scalar() or 0)

    return {
        "total_pickers": total_pickers,
        "total_scanned": total_scanned,
        "total_kg":      round(total_kg, 3),
    }


@router.get("/picker-stats")
async def get_picker_stats(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            Picker.picker_id,
            Picker.first_name,
            Picker.last_name,
            Picker.origin_place,
            func.count(HarvestEntry.box_number).label("total_boxes"),
            func.sum(Box.net_weight_kg).label("total_kg"),
        )
        .join(HarvestEntry, HarvestEntry.picker_id == Picker.picker_id, isouter=True)
        .join(Box, Box.box_id == HarvestEntry.box_type_id, isouter=True)
        .group_by(Picker.picker_id, Picker.first_name, Picker.last_name, Picker.origin_place)
        .order_by(func.count(HarvestEntry.box_number).desc())
    )
    rows = result.all()
    return [
        {
            "picker_id":    row.picker_id,
            "first_name":   row.first_name,
            "last_name":    row.last_name,
            "origin_place": row.origin_place,
            "total_boxes":  row.total_boxes or 0,
            "total_kg":     round(float(row.total_kg or 0), 3),
        }
        for row in rows
    ]

@router.get("/picker-daily-stats")
async def get_picker_daily_stats(
    from_date: date | None = None,
    to_date:   date | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(
            Picker.picker_id,
            Picker.first_name,
            Picker.last_name,
            HarvestEntry.harvest_date,
            func.sum(Box.net_weight_kg).label("daily_kg"),
        )
        .join(HarvestEntry, HarvestEntry.picker_id == Picker.picker_id)
        .join(Box, Box.box_id == HarvestEntry.box_type_id)
        .group_by(Picker.picker_id, Picker.first_name, Picker.last_name, HarvestEntry.harvest_date)
        .order_by(Picker.picker_id, HarvestEntry.harvest_date)
    )
    if from_date:
        query = query.where(HarvestEntry.harvest_date >= from_date)
    if to_date:
        query = query.where(HarvestEntry.harvest_date <= to_date)

    result = await db.execute(query)
    rows   = result.all()

    # group by picker
    pickers: dict[int, dict] = {}
    for row in rows:
        if row.picker_id not in pickers:
            pickers[row.picker_id] = {
                "picker_id":  row.picker_id,
                "first_name": row.first_name,
                "last_name":  row.last_name,
                "days":       {},
            }
        pickers[row.picker_id]["days"][str(row.harvest_date)] = round(float(row.daily_kg), 3)

    return [
        {
            "picker_id":  p["picker_id"],
            "first_name": p["first_name"],
            "last_name":  p["last_name"],
            "days":       p["days"],
            "total_kg":   round(sum(p["days"].values()), 3),
        }
        for p in pickers.values()
    ]


@router.get("/picker-box-stats")
async def get_picker_box_stats(
    from_date: date | None = None,
    to_date:   date | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(
            Picker.picker_id,
            Picker.first_name,
            Picker.last_name,
            Picker.national_id,
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
            Picker.picker_id,
            Picker.first_name,
            Picker.last_name,
            Picker.national_id,
            HarvestEntry.harvest_date,
            Box.box_id,
            Box.name,
            Box.net_weight_kg,
        )
        .order_by(Picker.picker_id, HarvestEntry.harvest_date, Box.box_id)
    )
    if from_date:
        query = query.where(HarvestEntry.harvest_date >= from_date)
    if to_date:
        query = query.where(HarvestEntry.harvest_date <= to_date)

    result = await db.execute(query)
    rows   = result.all()

    pickers: dict[int, dict] = {}
    for row in rows:
        if row.picker_id not in pickers:
            pickers[row.picker_id] = {
                "picker_id":   row.picker_id,
                "first_name":  row.first_name,
                "last_name":   row.last_name,
                "national_id": row.national_id,
                "days":        {},
                "total_kg":    0.0,
                "total_boxes": 0,
            }

        day_str = str(row.harvest_date)
        if day_str not in pickers[row.picker_id]["days"]:
            pickers[row.picker_id]["days"][day_str] = {
                "kg":        0.0,
                "box_types": {},
            }

        pickers[row.picker_id]["days"][day_str]["kg"] += float(row.daily_kg)
        pickers[row.picker_id]["days"][day_str]["box_types"][row.box_name] = {
            "count":         row.box_count,
            "net_weight_kg": float(row.net_weight_kg),
            "total_kg":      round(float(row.daily_kg), 3),
        }
        pickers[row.picker_id]["total_kg"]    += float(row.daily_kg)
        pickers[row.picker_id]["total_boxes"] += row.box_count

    for p in pickers.values():
        p["total_kg"] = round(p["total_kg"], 3)
        for day in p["days"].values():
            day["kg"] = round(day["kg"], 3)

    return list(pickers.values())

@router.get("/field-stats")
async def get_field_stats(
    from_date: date | None = None,
    to_date:   date | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(
            Field.field_id,
            Field.field_name,
            Field.description,
            func.count(HarvestEntry.box_number).label("total_boxes"),
            func.sum(Box.net_weight_kg).label("total_kg"),
        )
        .join(HarvestEntry, HarvestEntry.field_id == Field.field_id)
        .join(Box, Box.box_id == HarvestEntry.box_type_id)
        .group_by(Field.field_id, Field.field_name, Field.description)
        .order_by(func.sum(Box.net_weight_kg).desc())
    )
    if from_date:
        query = query.where(HarvestEntry.harvest_date >= from_date)
    if to_date:
        query = query.where(HarvestEntry.harvest_date <= to_date)

    result = await db.execute(query)
    rows   = result.all()

    return [
        {
            "field_id":    row.field_id,
            "field_name":  row.field_name,
            "description": row.description,
            "total_boxes": row.total_boxes or 0,
            "total_kg":    round(float(row.total_kg or 0), 3),
        }
        for row in rows
    ]