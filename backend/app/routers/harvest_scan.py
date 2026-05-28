from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.entities.harvest_entry import HarvestEntry
from app.entities.print_batch import PrintBatch
from app.schemas.harvest_entry import (
    BarcodeCheckRequest,
    BarcodeCheckResponse,
    BulkScanRequest,
    BulkScanResult,
    HarvestEntryResponse,
)

router = APIRouter(prefix="/harvest", tags=["harvest"])


def parse_barcode(barcode: str) -> tuple[int, int] | None:
    """Parse PPPP-BBBB → (picker_id, box_number)"""
    try:
        parts = barcode.strip().split("-")
        if len(parts) != 2:
            return None
        return int(parts[0]), int(parts[1])
    except ValueError:
        return None


async def check_barcode(barcode: str, db: AsyncSession) -> BarcodeCheckResponse:
    parsed = parse_barcode(barcode)
    if not parsed:
        return BarcodeCheckResponse(barcode=barcode, valid=False, reason="invalid_format")

    picker_id, box_number = parsed

    existing = await db.get(HarvestEntry, (picker_id, box_number))
    if existing:
        return BarcodeCheckResponse(
            barcode=barcode,
            valid=False,
            reason="already_scanned",
            scan_date=existing.scan_date,
        )

    result = await db.execute(
        select(PrintBatch).where(
            PrintBatch.picker_id == picker_id,
            PrintBatch.box_number_from <= box_number,
            PrintBatch.box_number_to >= box_number,
        )
    )
    if result.scalar_one_or_none() is None:
        return BarcodeCheckResponse(barcode=barcode, valid=False, reason="never_printed")

    return BarcodeCheckResponse(barcode=barcode, valid=True)


@router.post("/check", response_model=BarcodeCheckResponse)
async def check_single_barcode(data: BarcodeCheckRequest, db: AsyncSession = Depends(get_db)):
    return await check_barcode(data.barcode, db)


@router.post("/scan", response_model=BulkScanResult)
async def bulk_scan(data: BulkScanRequest, db: AsyncSession = Depends(get_db)):
    problems = []
    entries  = []

    for barcode in data.barcodes:
        result = await check_barcode(barcode, db)
        if not result.valid:
            problems.append(result)
        else:
            picker_id, box_number = parse_barcode(barcode)
            entries.append(HarvestEntry(
                picker_id=picker_id,
                box_number=box_number,
                field_id=data.field_id,
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
        problems=[],
    )


@router.get("/", response_model=list[HarvestEntryResponse])
async def get_all_entries(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(HarvestEntry).order_by(HarvestEntry.scan_date.desc())
    )
    return result.scalars().all()