from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.entities.box import Box
from app.schemas.box import BoxCreate, BoxResponse

router = APIRouter(prefix="/boxes", tags=["boxes"])


@router.get("/", response_model=list[BoxResponse])
async def get_all_boxes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Box).order_by(Box.box_id))
    return result.scalars().all()


@router.post("/", response_model=BoxResponse, status_code=201)
async def create_box(data: BoxCreate, db: AsyncSession = Depends(get_db)):
    box = Box(**data.model_dump())
    db.add(box)
    await db.commit()
    await db.refresh(box)
    return box


@router.put("/{box_id}", response_model=BoxResponse)
async def update_box(box_id: int, data: BoxCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Box).where(Box.box_id == box_id))
    box = result.scalar_one_or_none()
    if not box:
        raise HTTPException(status_code=404, detail="Box type not found")

    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(box, k, v)

    await db.commit()
    await db.refresh(box)
    return box


@router.delete("/{box_id}", status_code=204)
async def delete_box(box_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Box).where(Box.box_id == box_id))
    box = result.scalar_one_or_none()
    if not box:
        raise HTTPException(status_code=404, detail="Box type not found")

    await db.delete(box)
    await db.commit()