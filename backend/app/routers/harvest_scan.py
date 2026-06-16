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

import logging


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/harvest", tags=["harvest-scan"])


def parse_barcode(barcode: str) -> tuple[int, int] | None:
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
            scanned_at=existing.scanned_at,
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
async def check_single_barcode(
    data: BarcodeCheckRequest,
    db:   AsyncSession = Depends(get_db),
):
    return await check_barcode(data.barcode, db)


@router.post("/commit", response_model=BulkScanResult)
async def commit_scan(
    data: BulkScanRequest,
    db:   AsyncSession = Depends(get_db),
):
    logger.info(
        "Commit request — %d barcodes | field=%d box_type=%d date=%s",
        len(data.barcodes), data.field_id, data.box_type_id, data.harvest_date
    )

    problems  = []
    entries   = []
    seen      = set()

    for barcode in data.barcodes:
        if barcode in seen:
            logger.warning("Within-batch duplicate: %s", barcode)
            problems.append(BarcodeCheckResponse(
                barcode=barcode,
                valid=False,
                reason="already_scanned",
                scanned_at=None,
            ))
            continue
        seen.add(barcode)

        result = await check_barcode(barcode, db)
        if not result.valid:
            logger.warning("Invalid barcode: %s — reason: %s", barcode, result.reason)
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

    logger.info(
        "Pre-commit summary — valid: %d | problems: %d",
        len(entries), len(problems)
    )

    if entries:
        try:
            for entry in entries:
                db.add(entry)
            await db.commit()
            for entry in entries:
                await db.refresh(entry)
            logger.info("Committed %d entries successfully", len(entries))
        except Exception as e:
            logger.error("Commit failed — %s", str(e), exc_info=True)
            raise

    if problems:
        for p in problems:
            logger.warning("Problem — barcode: %s reason: %s", p.barcode, p.reason)

    logger.info(
        "Commit complete — accepted: %d | skipped: %d | success: %s",
        len(entries), len(problems), len(problems) == 0
    )

    return BulkScanResult(
        success=len(problems) == 0,
        accepted=[HarvestEntryResponse.model_validate(e) for e in entries],
        problems=problems,
    )