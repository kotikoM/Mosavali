from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.entities.fruit import Fruit
from app.schemas.fruit import FruitCreate, FruitResponse

router = APIRouter(prefix="/fruits", tags=["fruits"])

MAX_FRUITS = 99


@router.get("/", response_model=list[FruitResponse])
async def get_all_fruits(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Fruit))
    return result.scalars().all()


@router.post("/", response_model=FruitResponse)
async def create_fruit(data: FruitCreate, db: AsyncSession = Depends(get_db)):
    count_result = await db.execute(select(func.count()).select_from(Fruit))
    count = count_result.scalar()

    if count >= MAX_FRUITS:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum number of fruits reached ({MAX_FRUITS})"
        )

    fruit = Fruit(**data.model_dump())
    db.add(fruit)
    await db.commit()
    await db.refresh(fruit)
    return fruit