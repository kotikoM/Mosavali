from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.entities.harvest_entry import HarvestEntry

router = APIRouter(prefix="/harvest", tags=["harvest-entries"])


@router.get("/entries")
async def get_entries(
    page:      int        = Query(1, ge=1),
    page_size: int        = Query(25, ge=1, le=100),
    search:    str | None = Query(None),
    db:        AsyncSession = Depends(get_db),
):
    offset = (page - 1) * page_size
    base   = select(HarvestEntry).order_by(HarvestEntry.scan_date.desc())

    if search:
        s = search.strip()
        if '-' in s:
            parts = s.split('-')
            if len(parts) == 2:
                try:
                    base = base.where(
                        (HarvestEntry.picker_id  == int(parts[0])) &
                        (HarvestEntry.box_number == int(parts[1]))
                    )
                except ValueError:
                    pass
        else:
            try:
                num  = int(s)
                base = base.where(
                    (HarvestEntry.picker_id  == num) |
                    (HarvestEntry.box_number == num)
                )
            except ValueError:
                pass

    total_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total        = total_result.scalar_one()
    result       = await db.execute(base.offset(offset).limit(page_size))
    items        = result.scalars().all()

    return {
        "items":     items,
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "pages":     (total + page_size - 1) // page_size,
    }