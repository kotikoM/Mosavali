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
    result = await db.execute(select(Picker).order_by(Picker.picker_id))
    return result.scalars().all()


@router.post("/", response_model=PickerResponse)
async def create_picker(data: PickerCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Picker).where(Picker.national_id == data.national_id))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail={"code": "national_id_conflict", "message": "A picker with this National ID already exists"}
        )

    picker = Picker(**data.model_dump())
    db.add(picker)
    await db.commit()
    await db.refresh(picker)
    return picker



@router.put("/{picker_id}", response_model=PickerResponse)
async def update_picker(picker_id: int, data: PickerUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Picker).where(Picker.picker_id == picker_id))
    picker = result.scalar_one_or_none()
    if not picker:
        raise HTTPException(status_code=404, detail=f"Picker {picker_id} not found")

    if data.national_id and data.national_id != picker.national_id:
        existing = await db.execute(
            select(Picker).where(
                Picker.national_id == data.national_id,
                Picker.picker_id != picker_id        # exclude self
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail={"code": "national_id_conflict", "message": "A picker with this National ID already exists"}
            )

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(picker, field, value)

    await db.commit()
    await db.refresh(picker)
    return picker


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