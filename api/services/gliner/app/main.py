"""
GLiNER NER microservice for UNPA_Ingest extraction methodologies.

Endpoints:
  POST /ner   — extract named entities from text using GLiNER
  POST /batch — extract entities from multiple texts (for M5 batch route)
  GET  /health — liveness probe

Environment:
  GLINER_MODEL  — model name (default: urchade/gliner_medium-v2.1)
  PORT          — HTTP port (default: 5100)
"""

import os
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import uvicorn

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("gliner-service")

# ── Device detection ──────────────────────────────────────────────────────────

import torch

def _get_device() -> str:
    if torch.cuda.is_available():
        name = torch.cuda.get_device_name(0)
        mem  = torch.cuda.get_device_properties(0).total_memory // (1024**2)
        log.info(f"GPU available: {name} ({mem} MB VRAM)")
        return "cuda"
    log.info("No GPU — running on CPU")
    return "cpu"

DEVICE = _get_device()

# ── Model loader ──────────────────────────────────────────────────────────────

MODEL_NAME = os.getenv("GLINER_MODEL", "urchade/gliner_medium-v2.1")
_model = None

def get_model():
    global _model
    if _model is None:
        from gliner import GLiNER
        log.info(f"Loading GLiNER model: {MODEL_NAME} on {DEVICE}")
        _model = GLiNER.from_pretrained(MODEL_NAME)
        _model = _model.to(DEVICE)
        log.info(f"GLiNER model loaded (device={DEVICE})")
    return _model

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up on startup
    try:
        get_model()
    except Exception as e:
        log.warning(f"Model warm-up failed (will retry on first request): {e}")
    yield

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="GLiNER NER Service", version="1.0.0", lifespan=lifespan)

# UN canonical entity types → GLiNER label set
CANONICAL_LABELS = [
    "person", "organization", "actor", "document", "document reference",
    "policy", "system", "technology", "concept", "process",
    "event", "location", "work item",
]

LABEL_TO_CANONICAL = {
    "person": "PERSON",
    "organization": "ORGANIZATION",
    "org": "ORGANIZATION",
    "actor": "ACTOR",
    "document": "DOCUMENT",
    "document reference": "DOCUMENTREF",
    "docref": "DOCUMENTREF",
    "policy": "POLICY",
    "system": "SYSTEM",
    "technology": "TECHNOLOGY",
    "concept": "CONCEPT",
    "process": "PROCESS",
    "event": "EVENT",
    "location": "LOCATION",
    "work item": "WORK_ITEM",
}

# ── Schemas ───────────────────────────────────────────────────────────────────

class NERRequest(BaseModel):
    text: str = Field(..., min_length=10, max_length=50000)
    labels: Optional[list[str]] = Field(default=None, description="Custom label set; defaults to UN canonical types")
    threshold: float = Field(default=0.30, ge=0.0, le=1.0)

class EntitySpan(BaseModel):
    text: str
    label: str
    canonical_type: str
    score: float
    start: int
    end: int

class NERResponse(BaseModel):
    entities: list[EntitySpan]
    model: str
    text_length: int

class BatchRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=50)
    labels: Optional[list[str]] = None
    threshold: float = Field(default=0.30, ge=0.0, le=1.0)

class BatchResponse(BaseModel):
    results: list[NERResponse]
    model: str

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    model_loaded = _model is not None
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "model_loaded": model_loaded,
        "device": DEVICE,
        "cuda_available": torch.cuda.is_available(),
        "cuda_device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    }

@app.post("/ner", response_model=NERResponse)
def ner(req: NERRequest):
    try:
        model = get_model()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Model not available: {e}")

    labels = req.labels or CANONICAL_LABELS
    try:
        raw = model.predict_entities(req.text, labels, threshold=req.threshold)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"GLiNER inference error: {e}")

    entities = [
        EntitySpan(
            text=e["text"],
            label=e["label"],
            canonical_type=LABEL_TO_CANONICAL.get(e["label"].lower(), "CONCEPT"),
            score=round(float(e["score"]), 4),
            start=e.get("start", 0),
            end=e.get("end", 0),
        )
        for e in raw
    ]
    return NERResponse(entities=entities, model=MODEL_NAME, text_length=len(req.text))

@app.post("/batch", response_model=BatchResponse)
def batch_ner(req: BatchRequest):
    try:
        model = get_model()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Model not available: {e}")

    labels = req.labels or CANONICAL_LABELS
    results = []
    for text in req.texts:
        try:
            raw = model.predict_entities(text, labels, threshold=req.threshold)
            entities = [
                EntitySpan(
                    text=e["text"],
                    label=e["label"],
                    canonical_type=LABEL_TO_CANONICAL.get(e["label"].lower(), "CONCEPT"),
                    score=round(float(e["score"]), 4),
                    start=e.get("start", 0),
                    end=e.get("end", 0),
                )
                for e in raw
            ]
            results.append(NERResponse(entities=entities, model=MODEL_NAME, text_length=len(text)))
        except Exception as e:
            log.warning(f"Batch item failed: {e}")
            results.append(NERResponse(entities=[], model=MODEL_NAME, text_length=len(text)))

    return BatchResponse(results=results, model=MODEL_NAME)

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5100"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
