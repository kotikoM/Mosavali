from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from app.database import get_db
from app.entities.print_batch import PrintBatch
from app.entities.picker import Picker
from app.schemas.print_batch import PrintBatchResponse, PrintQueueRequest

router = APIRouter(prefix="/print-batches", tags=["print-batches"])


async def _create_single_batch(
    picker_id: int,
    quantity:  int,
    db:        AsyncSession,
) -> tuple[PrintBatch, str]:                        # ← return name too
    picker = await db.get(Picker, picker_id)
    if not picker:
        raise HTTPException(status_code=404, detail=f"Picker {picker_id} not found")

    await db.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": picker_id})

    result = await db.execute(
        select(func.coalesce(func.max(PrintBatch.box_number_to), 0))
        .where(PrintBatch.picker_id == picker_id)
    )
    last_box = result.scalar()

    batch = PrintBatch(
        picker_id=picker_id,
        box_number_from=last_box + 1,
        box_number_to=last_box + quantity,
    )
    db.add(batch)
    return batch, f"{picker.first_name} {picker.last_name}"


@router.post("/queue", response_model=list[PrintBatchResponse])
async def create_print_queue(data: PrintQueueRequest, db: AsyncSession = Depends(get_db)):
    if not data.items:
        raise HTTPException(status_code=400, detail="Queue is empty")

    pairs: list[tuple[PrintBatch, str]] = []
    for item in data.items:
        pair = await _create_single_batch(item.picker_id, item.quantity, db)
        pairs.append(pair)

    await db.commit()

    responses = []
    for batch, name in pairs:
        await db.refresh(batch)
        responses.append(PrintBatchResponse(
            batch_id=batch.batch_id,
            picker_id=batch.picker_id,
            picker_name=name,
            box_number_from=batch.box_number_from,
            box_number_to=batch.box_number_to,
            quantity=batch.quantity,
            printed_at=batch.printed_at,
        ))
    return responses


@router.get("/", response_model=list[PrintBatchResponse])
async def get_all_batches(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PrintBatch).order_by(PrintBatch.printed_at.desc())
    )
    return result.scalars().all()


@router.get("/{picker_id}", response_model=list[PrintBatchResponse])
async def get_batches_for_picker(picker_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PrintBatch)
        .where(PrintBatch.picker_id == picker_id)
        .order_by(PrintBatch.printed_at.desc())
    )
    return result.scalars().all()