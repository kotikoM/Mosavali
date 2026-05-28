from sqlalchemy import Integer, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Field(Base):
    __tablename__ = "field"

    field_id:    Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    field_name:  Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)