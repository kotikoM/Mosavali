from pydantic import BaseModel


class FruitCreate(BaseModel):
    fruit_type:   str
    variety_name: str


class FruitResponse(BaseModel):
    fruit_id:     int
    fruit_type:   str
    variety_name: str

    model_config = {"from_attributes": True}