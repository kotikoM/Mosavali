from pydantic import BaseModel


class FieldCreate(BaseModel):
    field_name:  str
    description: str | None = None


class FieldResponse(BaseModel):
    field_id:    int
    field_name:  str
    description: str | None

    model_config = {"from_attributes": True}