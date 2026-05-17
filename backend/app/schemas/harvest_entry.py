from pydantic import BaseModel
from datetime import date, datetime


class HarvestEntryResponse(BaseModel):
    fruit_id:     int
    picker_id:    int
    box_number:   int
    box_type_id:  int
    harvest_date: date
    scan_date:    datetime

    model_config = {"from_attributes": True}


class BarcodeCheckRequest(BaseModel):
    barcode: str


class BarcodeCheckResponse(BaseModel):
    barcode:      str
    valid:        bool
    reason:       str | None = None
    scan_date:    datetime | None = None


class BulkScanRequest(BaseModel):
    box_type_id:  int
    harvest_date: date
    barcodes:     list[str]


class BulkScanResult(BaseModel):
    success:  bool
    accepted: list[HarvestEntryResponse]
    problems: list[BarcodeCheckResponse]