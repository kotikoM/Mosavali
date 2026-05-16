from pydantic import BaseModel


class PickerCreate(BaseModel):
    national_id:  str
    first_name:   str
    last_name:    str
    origin_place: str | None = None
    bank_info:    str | None = None
    note:         str | None = None


class PickerResponse(BaseModel):
    picker_id:    int
    national_id:  str
    first_name:   str
    last_name:    str
    origin_place: str | None
    bank_info:    str | None
    note:         str | None

    model_config = {"from_attributes": True}