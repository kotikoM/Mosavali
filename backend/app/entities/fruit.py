from sqlalchemy import Integer, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Fruit(Base):
    __tablename__ = "fruit"

    fruit_id:     Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fruit_type:   Mapped[str] = mapped_column(Text, nullable=False)
    variety_name: Mapped[str] = mapped_column(Text, nullable=False)