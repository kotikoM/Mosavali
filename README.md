# Mosavali

Field harvest management system for single-crop, multi-field operations.
Tracks pickers, box types, daily harvests, and print batches end-to-end.
Deployable via Docker.

---

## Operational Flow

**Setup** - define fields and box types (with empty/full/net weights) before the season starts.

**Per picker** - register each picker with their personal and banking details, then print a sticker batch which assigns them a sequential range of uniquely numbered box barcodes.

**Harvest day** - open a scan session, select the field and box type in use, then scan each filled box. Every sticker is recorded against that picker, field, box type, and harvest date.

**Tracking** - every box ever filled is traceable: who picked it, on which field, in which box type, on which date. 
Aggregated per picker per day, per field, per box type. Queryable across any date range and exportable to Excel in full detail.


---

## Stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | React + TypeScript + Vite + TailwindCSS |
| Backend   | FastAPI + SQLAlchemy (async) |
| Database  | PostgreSQL |
| Runtime   | Docker Compose |
| Excel     | ExcelJS + file-saver |
| Charts    | Recharts |
| Icons     | Lucide React |

---
## Features

**Dashboard** - daily field report, all-time totals, harvest by field pie chart, picker stats table, picker × day harvest grid with Excel export.

**Scanning** - scan sessions with field/box/date selection, physical scanner support, duplicate detection, velocity chart, searchable entries table.

**Pickers** - full CRUD with name, national ID, phone, origin, IBAN, notes.

**Printing** - sticker print queue, pdf generation.

**Exports** - Daily Harvest (picker × day matrix with salary formula), Sticker Detail (per-picker summary + every entry), Master Export (5-sheet workbook via sidebar).

---

## Data Model

```
picker          - registered field workers
field           - harvest locations
box             - box types with empty/full/net weights (net is computed)
harvest_entry   - one row per scanned sticker (picker + box + field + date)
print_batch     - sticker print runs (picker, box range, quantity, timestamp)
```

Barcodes are formatted `PPPP-BBBB` where `PPPP` is picker ID and `BBBB` is box number, both zero-padded to 4 digits.

---

## Docker Setup

**Start:**
```shell
docker-compose up --build -d
```

**Full reset (wipes volumes):**
```shell
docker-compose down -v
```

Frontend runs on `http://localhost:5173` 

Backend API on `http://localhost:8000`.

---

## API Overview

| Prefix | Description |
|--------|-------------|
| `/harvest` | Scan commit, entry listing, barcode check |
| `/harvest/stats` | Daily stats, overview, picker stats, field stats |
| `/harvest/export` | Picker detail export, master export |
| `/pickers` | Picker CRUD |
| `/fields` | Field CRUD |
| `/boxes` | Box type CRUD |
| `/print-batches` | Print queue creation, batch history |