from sqlalchemy import Integer, ForeignKey, TIMESTAMP, Computed
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from datetime import datetime
from app.database import Base


class PrintBatch(Base):
    __tablename__ = "print_batch"

    batch_id:        Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    fruit_id:        Mapped[int]      = mapped_column(Integer, ForeignKey("fruit.fruit_id"), nullable=False)
    picker_id:       Mapped[int]      = mapped_column(Integer, ForeignKey("picker.picker_id"), nullable=False)
    box_number_from: Mapped[int]      = mapped_column(Integer, nullable=False)
    box_number_to:   Mapped[int]      = mapped_column(Integer, nullable=False)
    quantity:        Mapped[int]      = mapped_column(Integer, Computed("box_number_to - box_number_from + 1", persisted=True))
    printed_at:      Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())