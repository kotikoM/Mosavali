from pydantic import BaseModel, field_validator
from datetime import datetime


class PrintBatchCreate(BaseModel):
    picker_id: int
    quantity:  int

    @field_validator("quantity")
    @classmethod
    def check_quantity(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Quantity must be at least 1")
        return v


class PrintBatchResponse(BaseModel):
    batch_id:        int
    picker_id:       int
    picker_name:     str
    box_number_from: int
    box_number_to:   int
    quantity:        int
    printed_at:      datetime

    model_config = {"from_attributes": True}


class PrintQueueItem(BaseModel):
    picker_id: int
    quantity:  int


class PrintQueueRequest(BaseModel):
    items: list[PrintQueueItem]


class GeneratePdfRequest(BaseModel):
    items: list[PrintQueueItem]
    scale: float = 1.0

    @field_validator("items")
    @classmethod
    def check_items(cls, v: list[PrintQueueItem]) -> list[PrintQueueItem]:
        if not v:
            raise ValueError("Items list must not be empty")
        return v

    @field_validator("scale")
    @classmethod
    def check_scale(cls, v: float) -> float:
        if not (0.5 <= v <= 3.0):
            raise ValueError("Scale must be between 0.5 and 3.0")
        return v