from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from app.database import get_db
from app.entities.harvest_entry import HarvestEntry
from app.entities.print_batch import PrintBatch
from app.entities.picker import Picker
from app.entities.box import Box
from app.schemas.harvest_entry import (
    BarcodeCheckRequest,
    BarcodeCheckResponse,
    BulkScanRequest,
    BulkScanResult,
    HarvestEntryResponse,
    DailyStatEntry,
    DailyStatsResponse
)

router = APIRouter(prefix="/harvest", tags=["harvest"])


def parse_barcode(barcode: str) -> tuple[int, int, int] | None:
    try:
        parts = barcode.strip().split("-")
        if len(parts) != 3:
            return None
        fruit_id   = int(parts[0])
        picker_id  = int(parts[1])
        box_number = int(parts[2])
        return fruit_id, picker_id, box_number
    except ValueError:
        return None


async def check_barcode(barcode: str, db: AsyncSession) -> BarcodeCheckResponse:
    parsed = parse_barcode(barcode)
    if not parsed:
        return BarcodeCheckResponse(
            barcode=barcode,
            valid=False,
            reason="invalid_format"
        )

    fruit_id, picker_id, box_number = parsed

    existing = await db.get(HarvestEntry, (picker_id, box_number))
    if existing:
        return BarcodeCheckResponse(
            barcode=barcode,
            valid=False,
            reason="already_scanned",
            scan_date=existing.scan_date
        )

    result = await db.execute(
        select(PrintBatch).where(
            PrintBatch.picker_id == picker_id,
            PrintBatch.box_number_from <= box_number,
            PrintBatch.box_number_to >= box_number
        )
    )
    if result.scalar_one_or_none() is None:
        return BarcodeCheckResponse(
            barcode=barcode,
            valid=False,
            reason="never_printed"
        )

    return BarcodeCheckResponse(barcode=barcode, valid=True)


@router.post("/check", response_model=BarcodeCheckResponse)
async def check_single_barcode(
    data: BarcodeCheckRequest,
    db: AsyncSession = Depends(get_db)
):
    return await check_barcode(data.barcode, db)


@router.post("/scan", response_model=BulkScanResult)
async def bulk_scan(
    data: BulkScanRequest,
    db: AsyncSession = Depends(get_db)
):
    problems = []
    entries  = []

    for barcode in data.barcodes:
        result = await check_barcode(barcode, db)
        if not result.valid:
            problems.append(result)
        else:
            parsed = parse_barcode(barcode)
            fruit_id, picker_id, box_number = parsed
            entries.append(HarvestEntry(
                fruit_id=fruit_id,
                picker_id=picker_id,
                box_number=box_number,
                box_type_id=data.box_type_id,
                harvest_date=data.harvest_date,
            ))

    if problems:
        return BulkScanResult(success=False, accepted=[], problems=problems)

    for entry in entries:
        db.add(entry)
    await db.commit()
    for entry in entries:
        await db.refresh(entry)

    return BulkScanResult(
        success=True,
        accepted=[HarvestEntryResponse.model_validate(e) for e in entries],
        problems=[]
    )


@router.get("/", response_model=list[HarvestEntryResponse])
async def get_all_entries(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(HarvestEntry).order_by(HarvestEntry.scan_date.desc())
    )
    return result.scalars().all()


@router.get("/stats", response_model=DailyStatsResponse)
async def get_daily_stats(
    from_date: date | None = None,
    to_date:   date | None = None,
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(
            HarvestEntry.harvest_date,
            HarvestEntry.box_type_id,
            func.count().label("count")
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

    stats = [
        DailyStatEntry(
            harvest_date=row.harvest_date,
            box_type_id=row.box_type_id,
            count=row.count
        )
        for row in rows
    ]

    return DailyStatsResponse(stats=stats, total=sum(s.count for s in stats))


@router.get("/overview")
async def get_overview(db: AsyncSession = Depends(get_db)):
    # total pickers
    picker_result = await db.execute(select(func.count()).select_from(Picker))
    total_pickers = picker_result.scalar() or 0

    # total boxes scanned
    scan_result = await db.execute(select(func.count()).select_from(HarvestEntry))
    total_scanned = scan_result.scalar() or 0

    # total kg — join harvest_entry with box to get net_weight_kg per entry
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