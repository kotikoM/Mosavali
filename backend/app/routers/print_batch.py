from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from app.database import get_db
from app.entities.print_batch import PrintBatch
from app.entities.picker import Picker
from app.entities.fruit import Fruit
from app.schemas.print_batch import PrintBatchCreate, PrintBatchResponse, PrintQueueRequest

router = APIRouter(prefix="/print-batches", tags=["print-batches"])


async def _create_single_batch(
    fruit_id: int,
    picker_id: int,
    quantity: int,
    db: AsyncSession
) -> PrintBatch:
    # verify picker exists
    picker = await db.get(Picker, picker_id)
    if not picker:
        raise HTTPException(status_code=404, detail=f"Picker {picker_id} not found")

    # verify fruit exists
    fruit = await db.get(Fruit, fruit_id)
    if not fruit:
        raise HTTPException(status_code=404, detail=f"Fruit {fruit_id} not found")

    # advisory lock per picker — prevents race conditions
    await db.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": picker_id})

    # compute next box number
    result = await db.execute(
        select(func.coalesce(func.max(PrintBatch.box_number_to), 0))
        .where(PrintBatch.picker_id == picker_id)
    )
    last_box = result.scalar()
    box_number_from = last_box + 1
    box_number_to = last_box + quantity

    batch = PrintBatch(
        fruit_id=fruit_id,
        picker_id=picker_id,
        box_number_from=box_number_from,
        box_number_to=box_number_to,
    )
    db.add(batch)
    return batch

@router.post("/", response_model=PrintBatchResponse)
async def create_print_batch(data: PrintBatchCreate, db: AsyncSession = Depends(get_db)):
    batch = await _create_single_batch(data.fruit_id, data.picker_id, data.quantity, db)
    await db.commit()
    await db.refresh(batch)
    return batch

@router.post("/queue", response_model=list[PrintBatchResponse])
async def create_print_queue(data: PrintQueueRequest, db: AsyncSession = Depends(get_db)):
    if not data.items:
        raise HTTPException(status_code=400, detail="Queue is empty")

    batches = []
    for item in data.items:
        batch = await _create_single_batch(item.fruit_id, item.picker_id, item.quantity, db)
        batches.append(batch)

    # commit all at once — all succeed or all fail
    await db.commit()

    for batch in batches:
        await db.refresh(batch)

    return batches

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