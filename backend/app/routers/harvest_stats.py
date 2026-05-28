from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from app.database import get_db
from app.entities.harvest_entry import HarvestEntry
from app.entities.picker import Picker
from app.entities.box import Box
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