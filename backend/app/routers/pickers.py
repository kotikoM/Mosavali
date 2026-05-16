from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.entities.picker import Picker
from app.schemas.picker import PickerCreate, PickerResponse

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