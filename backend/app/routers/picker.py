from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.entities.picker import Picker
from app.schemas.picker import PickerCreate, PickerUpdate, PickerResponse

router = APIRouter(prefix="/pickers", tags=["pickers"])


@router.get("/", response_model=list[PickerResponse])
async def get_all_pickers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Picker))
    return result.scalars().all()


@router.post("/", response_model=PickerResponse)
async def create_picker(data: PickerCreate, db: AsyncSession = Depends(get_db)):
    picker = Picker(**data.model_dump())
    db.add(picker)
    try:
        await db.commit()
        await db.refresh(picker)
        return picker
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Picker with national_id {data.national_id} already exists"
        )


@router.put("/{picker_id}", response_model=PickerResponse)
async def update_picker(picker_id: int, data: PickerUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Picker).where(Picker.picker_id == picker_id))
    picker = result.scalar_one_or_none()

    if not picker:
        raise HTTPException(status_code=404, detail=f"Picker {picker_id} not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(picker, field, value)

    try:
        await db.commit()
        await db.refresh(picker)
        return picker
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Update caused a conflict")


@router.delete("/{picker_id}")
async def delete_picker(picker_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Picker).where(Picker.picker_id == picker_id)
    )
    picker = result.scalar_one_or_none()

    if not picker:
        raise HTTPException(
            status_code=404,
            detail=f"Picker {picker_id} not found"
        )

    await db.delete(picker)
    await db.commit()

    return {
        "message": f"Picker {picker_id} deleted successfully"
    }