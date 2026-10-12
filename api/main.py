from __future__ import annotations
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pipeline import pipeline


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, pipeline.startup)
    yield


app = FastAPI(title='FraudCast API', lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:5173', 'http://localhost:3000'],
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/api/health')
def health():
    return {'ready': pipeline.is_ready, 'message': pipeline.status_msg}


@app.get('/api/stats')
def stats():
    if not pipeline.is_ready:
        raise HTTPException(503, 'Pipeline not ready')
    return pipeline.get_stats()


@app.get('/api/transactions')
def transactions():
    if not pipeline.is_ready:
        raise HTTPException(503, 'Pipeline not ready')
    return pipeline._all_scores


class ScoreRequest(BaseModel):
    amount: float
    timestamp: str
    domain: str
    recipient: str
    latitude: float
    longitude: float
    prev_latitude: float | None = None
    prev_longitude: float | None = None
    prev_timestamp: str | None = None


@app.post('/api/score')
def score(req: ScoreRequest):
    if not pipeline.is_ready:
        raise HTTPException(503, 'Pipeline not ready')
    return pipeline.score_transaction(
        amount=req.amount,
        timestamp_str=req.timestamp,
        domain=req.domain,
        recipient=req.recipient,
        lat=req.latitude,
        lon=req.longitude,
        prev_lat=req.prev_latitude,
        prev_lon=req.prev_longitude,
        prev_ts_str=req.prev_timestamp,
    )
