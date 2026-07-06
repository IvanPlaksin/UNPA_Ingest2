"""
TEI-compatible embeddings server (GPU-enabled, Pascal-friendly).

Drop-in replacement for HuggingFace text-embeddings-inference that runs on
older CUDA architectures (e.g. Quadro P2000 / sm_61) which the official TEI
GPU images do not support. Speaks the same minimal HTTP contract the API's
tei.service.js already expects:

  POST /embed   { inputs: string|string[], normalize?: bool, truncate?: bool }
                -> number[][]  (array of vectors, one per input)
  GET  /health  -> 200 OK
  GET  /info    -> { model_id, max_input_length, ... }

Model + dimensionality are unchanged (intfloat/multilingual-e5-large, 1024d),
so existing Qdrant collections stay compatible — only the compute backend
moves from CPU to GPU.
"""

import os
import logging

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Union
from sentence_transformers import SentenceTransformer
import uvicorn

logging.basicConfig(level=logging.INFO, format="%(asctime)s [TEI-GPU] %(message)s")
log = logging.getLogger("tei-gpu")

MODEL_ID = os.getenv("MODEL_ID", "intfloat/multilingual-e5-large")
MAX_INPUT_LENGTH = int(os.getenv("MAX_INPUT_LENGTH", "512"))
PORT = int(os.getenv("PORT", "80"))
# HF cache -> reuse the existing tei-cache volume mounted at /data
os.environ.setdefault("HF_HOME", "/data")
os.environ.setdefault("SENTENCE_TRANSFORMERS_HOME", "/data")

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

log.info(f"Loading model '{MODEL_ID}' on device '{DEVICE}'...")
if DEVICE == "cuda":
    try:
        name = torch.cuda.get_device_name(0)
        cap = torch.cuda.get_device_capability(0)
        log.info(f"CUDA device: {name} (compute capability {cap[0]}.{cap[1]})")
    except Exception as exc:  # pragma: no cover - informational only
        log.warning(f"Could not query CUDA device: {exc}")

model = SentenceTransformer(MODEL_ID, device=DEVICE)
model.max_seq_length = MAX_INPUT_LENGTH
# fp16 on GPU roughly halves VRAM and speeds up inference; cosine similarity
# (what Qdrant uses) is unaffected by the reduced precision.
if DEVICE == "cuda":
    model = model.half()
EMBED_DIM = model.get_sentence_embedding_dimension()
log.info(f"Model ready. Embedding dimension: {EMBED_DIM}, max_seq_length: {model.max_seq_length}")


class EmbedRequest(BaseModel):
    inputs: Union[str, List[str]]
    normalize: bool = True
    truncate: bool = True


app = FastAPI(title="TEI-GPU", version="1.0.0")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/info")
def info():
    return {
        "model_id": MODEL_ID,
        "max_input_length": model.max_seq_length,
        "embedding_dimension": EMBED_DIM,
        "device": DEVICE,
        "dtype": str(next(model.parameters()).dtype),
        "backend": "sentence-transformers",
    }


@app.post("/embed")
def embed(req: EmbedRequest):
    texts = [req.inputs] if isinstance(req.inputs, str) else req.inputs
    if not texts:
        return []
    try:
        with torch.inference_mode():
            vectors = model.encode(
                texts,
                normalize_embeddings=req.normalize,
                convert_to_numpy=True,
                show_progress_bar=False,
                batch_size=int(os.getenv("ENCODE_BATCH_SIZE", "32")),
            )
        # Return plain nested lists — matches TEI's raw number[][] response.
        return vectors.astype("float32").tolist()
    except Exception as exc:
        log.exception("Embedding failed")
        raise HTTPException(status_code=500, detail=str(exc))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
