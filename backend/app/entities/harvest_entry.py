from sqlalchemy import Integer, ForeignKey, Date, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from datetime import date, datetime
from app.database import Base


class HarvestEntry(Base):
    __tablename__ = "harvest_entry"

    field_id:     Mapped[int]      = mapped_column(Integer, ForeignKey("field.field_id"), nullable=False)
    picker_id:    Mapped[int]      = mapped_column(Integer, ForeignKey("picker.picker_id"), primary_key=True)
    box_number:   Mapped[int]      = mapped_column(Integer, primary_key=True)
    box_type_id:  Mapped[int]      = mapped_column(Integer, ForeignKey("box.box_id"), nullable=False)
    harvest_date: Mapped[date]     = mapped_column(Date, nullable=False)
    scan_date:    Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())