from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers.picker import router as pickers_router
from app.routers.field import router as fields_router
from app.routers.box import router as boxes_router
from app.routers.print_batch import router as print_batches_router
from app.routers.harvest_scan import router as harvest_scan_router
from app.routers.harvest_stats import router as harvest_stats_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="Mosavali", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_headers=["*"],
    allow_methods=["*"],
)

app.include_router(pickers_router)
app.include_router(fields_router)
app.include_router(boxes_router)
app.include_router(print_batches_router)
app.include_router(harvest_scan_router)
app.include_router(harvest_stats_router)


@app.get("/health")
async def health():
    return {"status": "ok"}