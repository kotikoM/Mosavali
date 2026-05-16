from sqlalchemy import Integer, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Picker(Base):
    __tablename__ = "picker"

    picker_id:    Mapped[int]        = mapped_column(Integer, primary_key=True, autoincrement=True)
    national_id:  Mapped[str]        = mapped_column(Text, nullable=False, unique=True)
    first_name:   Mapped[str]        = mapped_column(Text, nullable=False)
    last_name:    Mapped[str]        = mapped_column(Text, nullable=False)
    origin_place: Mapped[str | None] = mapped_column(Text)
    bank_info:    Mapped[str | None] = mapped_column(Text)
    note:         Mapped[str | None] = mapped_column(Text)