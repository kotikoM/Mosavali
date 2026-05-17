from pydantic import BaseModel, model_validator
from decimal import Decimal


class BoxCreate(BaseModel):
    name:            str
    empty_weight_kg: Decimal
    full_weight_kg:  Decimal
    description:     str | None = None

    @model_validator(mode="after")
    def check_weights(self):
        if self.full_weight_kg <= self.empty_weight_kg:
            raise ValueError("full_weight_kg must be greater than empty_weight_kg")
        return self


class BoxResponse(BaseModel):
    box_id:          int
    name:            str
    empty_weight_kg: Decimal
    full_weight_kg:  Decimal
    net_weight_kg:   Decimal
    description:     str | None

    model_config = {"from_attributes": True}