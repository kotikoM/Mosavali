from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.entities.field import Field
from app.schemas.field import FieldCreate, FieldResponse

router = APIRouter(prefix="/fields", tags=["fields"])


@router.get("/", response_model=list[FieldResponse])
async def get_all_fields(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Field).order_by(Field.field_id))
    return result.scalars().all()


@router.post("/", response_model=FieldResponse, status_code=201)
async def create_field(data: FieldCreate, db: AsyncSession = Depends(get_db)):
    field = Field(**data.model_dump())
    db.add(field)
    await db.commit()
    await db.refresh(field)
    return field


@router.put("/{field_id}", response_model=FieldResponse)
async def update_field(field_id: int, data: FieldCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Field).where(Field.field_id == field_id))
    field  = result.scalar_one_or_none()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(field, k, v)
    await db.commit()
    await db.refresh(field)
    return field


@router.delete("/{field_id}", status_code=204)
async def delete_field(field_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Field).where(Field.field_id == field_id))
    field  = result.scalar_one_or_none()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    await db.delete(field)
    await db.commit()