from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.entities.box import Box
from app.schemas.box import BoxCreate, BoxResponse

router = APIRouter(prefix="/boxes", tags=["boxes"])


@router.get("/", response_model=list[BoxResponse])
async def get_all_boxes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Box))
    return result.scalars().all()


@router.post("/", response_model=BoxResponse)
async def create_box(data: BoxCreate, db: AsyncSession = Depends(get_db)):
    box = Box(**data.model_dump())
    db.add(box)
    await db.commit()
    await db.refresh(box)
    return box