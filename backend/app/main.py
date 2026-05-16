from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers.pickers import router as pickers_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="Mosavali", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pickers_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
