from pydantic import BaseModel, field_validator
from datetime import datetime


class PrintBatchCreate(BaseModel):
    picker_id: int
    quantity:  int

    @field_validator("quantity")
    @classmethod
    def check_quantity(cls, v):
        if v < 1:
            raise ValueError("Quantity must be at least 1")
        return v


class PrintBatchResponse(BaseModel):
    batch_id:        int
    picker_id:       int
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