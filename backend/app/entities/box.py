from sqlalchemy import Integer, Text, Numeric, Computed
from sqlalchemy.orm import Mapped, mapped_column
from decimal import Decimal
from app.database import Base


class Box(Base):
    __tablename__ = "box"

    box_id:          Mapped[int]        = mapped_column(Integer, primary_key=True, autoincrement=True)
    name:            Mapped[str]        = mapped_column(Text, nullable=False)
    empty_weight_kg: Mapped[Decimal]    = mapped_column(Numeric(6, 3), nullable=False)
    full_weight_kg:  Mapped[Decimal]    = mapped_column(Numeric(6, 3), nullable=False)
    net_weight_kg:   Mapped[Decimal]    = mapped_column(Numeric(6, 3), Computed("full_weight_kg - empty_weight_kg", persisted=True))
    description:     Mapped[str | None] = mapped_column(Text)