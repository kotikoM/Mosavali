from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.units import mm
from reportlab.graphics.barcode.code128 import Code128
from io import BytesIO
from app.database import get_db
from app.entities.print_batch import PrintBatch
from app.entities.picker import Picker
from app.schemas.print_batch import (
    PrintBatchResponse,
    PrintQueueRequest,
    GeneratePdfRequest,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

_GEO_FONT = "NotoSansGeorgian"
pdfmetrics.registerFont(
    TTFont(
        _GEO_FONT,
        os.path.join(os.path.dirname(__file__), "..", "fonts", "NotoSansGeorgian-Regular.ttf"),
    )
)

router = APIRouter(prefix="/print-batches", tags=["print-batches"])


# ── Helpers ───────────────────────────────────────────────────────────

async def _create_single_batch(
    picker_id: int,
    quantity:  int,
    db:        AsyncSession,
) -> tuple[PrintBatch, Picker]:
    picker = await db.get(Picker, picker_id)
    if not picker:
        raise HTTPException(status_code=404, detail=f"Picker {picker_id} not found")

    await db.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": picker_id})

    result = await db.execute(
        select(func.coalesce(func.max(PrintBatch.box_number_to), 0))
        .where(PrintBatch.picker_id == picker_id)
    )
    last_box = result.scalar()

    batch = PrintBatch(
        picker_id=picker_id,
        box_number_from=last_box + 1,
        box_number_to=last_box + quantity,
    )
    db.add(batch)
    return batch, picker


# ── Routes ────────────────────────────────────────────────────────────

@router.post("/queue", response_model=list[PrintBatchResponse])
async def create_print_queue(
    data: PrintQueueRequest,
    db:   AsyncSession = Depends(get_db),
):
    if not data.items:
        raise HTTPException(status_code=400, detail="Queue is empty")

    pairs: list[tuple[PrintBatch, str]] = []
    for item in data.items:
        batch, picker = await _create_single_batch(item.picker_id, item.quantity, db)
        pairs.append((batch, f"{picker.first_name} {picker.last_name}"))

    await db.commit()

    responses = []
    for batch, name in pairs:
        await db.refresh(batch)
        responses.append(PrintBatchResponse(
            batch_id=batch.batch_id,
            picker_id=batch.picker_id,
            picker_name=name,
            box_number_from=batch.box_number_from,
            box_number_to=batch.box_number_to,
            quantity=batch.quantity,
            printed_at=batch.printed_at,
        ))
    return responses


@router.post("/generate-pdf")
async def generate_pdf(
    req: GeneratePdfRequest,
    db:  AsyncSession = Depends(get_db),
):
    # ── Create batches ────────────────────────────────────────────────
    pairs: list[tuple[PrintBatch, Picker]] = []
    for item in req.items:
        batch, picker = await _create_single_batch(item.picker_id, item.quantity, db)
        pairs.append((batch, picker))

    await db.commit()

    for batch, _ in pairs:
        await db.refresh(batch)

    # ── Sticker dimensions ────────────────────────────────────────────
    s = req.scale
    W = 97 * mm
    margin = 2 * mm
    gap = 1 * mm
    code_h = 7 * mm
    name_h = 5 * mm
    bc_h = 20 * mm
    H = margin * 2 + bc_h + gap + code_h + gap + name_h

    # y anchors (ReportLab: y=0 is bottom-left)
    # top→bottom on paper: barcode → code text → name
    name_y = margin
    code_y = margin + name_h + gap
    bc_y   = margin + name_h + gap + code_h + gap

    code_font = max(16, int(16 + 4 * s))
    name_font = max(13, int(13 + 3 * s))

    # ── Build PDF ─────────────────────────────────────────────────────
    buf = BytesIO()
    c   = rl_canvas.Canvas(buf, pagesize=(W, H))

    for batch, picker in pairs:
        name = f"{picker.last_name} {picker.first_name}"

        for box_num in range(batch.box_number_from, batch.box_number_to + 1):
            code_str = f"{picker.picker_id:04d}-{box_num:04d}"

            # Auto-fit barWidth so barcode fills the label width.
            # Render a 1-unit-tall test barcode to measure total module count,
            # then calculate barWidth = available_width / module_count.
            test_bc = Code128(code_str, barHeight=1, barWidth=1, humanReadable=False, quiet=False)
            full_w = (W - 2 * margin) / test_bc.width
            bar_w = full_w * min(s, 1.0)

            # Row 1 — Code 128 barcode (top, full width)
            bc = Code128(code_str, barHeight=bc_h, barWidth=bar_w, humanReadable=False, quiet=False)
            bc.drawOn(c, (W - bc.width) / 2, bc_y)

            # Row 2 — PPPP-NNNN code text
            c.setFont("Courier-Bold", code_font)
            c.drawCentredString(W / 2, code_y + 2 * mm, code_str)

            # Row 3 — picker name
            c.setFont(_GEO_FONT, name_font)
            c.drawCentredString(W / 2, name_y + 2 * mm, name)

            c.showPage()

    c.save()
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=\"stickers.pdf\""},
    )


@router.get("/", response_model=list[PrintBatchResponse])
async def get_all_batches(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PrintBatch).order_by(PrintBatch.printed_at.desc())
    )
    return result.scalars().all()


@router.get("/{picker_id}", response_model=list[PrintBatchResponse])
async def get_batches_for_picker(
    picker_id: int,
    db:        AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PrintBatch)
        .where(PrintBatch.picker_id == picker_id)
        .order_by(PrintBatch.printed_at.desc())
    )
    return result.scalars().all()