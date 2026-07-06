"""
Knowledge Map Routes — UMAP layout + cluster labelling for DevDialogue Vector Knowledge Field.

POST /api/v1/knowledge-map/layout
    Accepts entity vectors, runs UMAP → 3D, HDBSCAN clusters.
    Returns per-entity { entity_id, x, y, z, cluster }.

POST /api/v1/knowledge-map/search
    Accepts a query vector, returns nearest entity_ids with distances.

GET  /api/v1/knowledge-map/health
    Reports whether umap-learn and hdbscan are available.
"""

import logging
from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel
import numpy as np

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Pydantic models ────────────────────────────────────────────────────────────

class EntityVector(BaseModel):
    entity_id: str
    vector: List[float]
    name: Optional[str] = None
    type: Optional[str] = None

class LayoutRequest(BaseModel):
    entities: List[EntityVector]
    n_neighbors: int = 15          # UMAP: local neighbourhood size
    min_dist: float = 0.1          # UMAP: minimum distance between points
    min_cluster_size: int = 3      # HDBSCAN: minimum cluster size
    random_state: int = 42

class LayoutPoint(BaseModel):
    entity_id: str
    x: float
    y: float
    z: float
    cluster: int                   # -1 = noise / unclustered

class LayoutResponse(BaseModel):
    layout: List[LayoutPoint]
    cluster_count: int
    entity_count: int

class SearchRequest(BaseModel):
    query_vector: List[float]
    candidate_vectors: List[EntityVector]
    top_k: int = 20

class SearchResult(BaseModel):
    entity_id: str
    score: float                   # cosine similarity 0–1

class SearchResponse(BaseModel):
    results: List[SearchResult]

# ── Helpers ────────────────────────────────────────────────────────────────────

def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/health")
async def knowledge_map_health():
    """Check availability of UMAP and HDBSCAN packages."""
    status = {}
    try:
        import umap  # noqa: F401
        status["umap"] = "ok"
    except ImportError as e:
        status["umap"] = f"missing: {e}"
    try:
        import hdbscan  # noqa: F401
        status["hdbscan"] = "ok"
    except ImportError as e:
        status["hdbscan"] = f"missing: {e}"
    ready = all(v == "ok" for v in status.values())
    return {"ready": ready, "packages": status}


@router.post("/layout", response_model=LayoutResponse)
async def compute_layout(req: LayoutRequest):
    """
    UMAP dimensionality reduction + HDBSCAN clustering.

    Input: list of {entity_id, vector} (1024-dim).
    Output: per-entity {x, y, z, cluster}.

    Fallback: if umap-learn is not installed, returns PCA-based 3D coordinates.
    """
    if not req.entities:
        return LayoutResponse(layout=[], cluster_count=0, entity_count=0)

    ids     = [e.entity_id for e in req.entities]
    matrix  = np.array([e.vector for e in req.entities], dtype=np.float32)

    # Normalise rows for cosine compatibility
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1, norms)
    matrix = matrix / norms

    n = len(ids)
    n_components = 3
    n_neighbors  = min(req.n_neighbors, max(2, n - 1))

    # ── UMAP ──────────────────────────────────────────────────────────────────
    coords_3d = None
    try:
        import umap
        reducer = umap.UMAP(
            n_components=n_components,
            n_neighbors=n_neighbors,
            min_dist=req.min_dist,
            metric="cosine",
            random_state=req.random_state,
            low_memory=(n > 5000),
        )
        coords_3d = reducer.fit_transform(matrix)
        logger.info(f"[KnowledgeMap] UMAP: {n} entities → 3D (neighbours={n_neighbors})")
    except ImportError:
        # Fallback: PCA via numpy SVD
        logger.warning("[KnowledgeMap] umap-learn not available, falling back to PCA")
        centered = matrix - matrix.mean(axis=0)
        _, _, Vt = np.linalg.svd(centered, full_matrices=False)
        coords_3d = centered @ Vt[:n_components].T
    except Exception as e:
        logger.error(f"[KnowledgeMap] UMAP failed: {e}")
        coords_3d = np.random.randn(n, 3).astype(np.float32)

    # Normalise coords to [-10, 10] range for consistent scene scale
    for dim in range(3):
        col = coords_3d[:, dim]
        span = col.max() - col.min()
        if span > 0:
            coords_3d[:, dim] = (col - col.min()) / span * 20 - 10

    # ── HDBSCAN clustering ─────────────────────────────────────────────────────
    clusters = np.full(n, -1, dtype=int)
    cluster_count = 0
    try:
        import hdbscan
        min_size = min(req.min_cluster_size, max(2, n // 5))
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_size,
            metric="euclidean",
            cluster_selection_method="eom",
        )
        labels = clusterer.fit_predict(coords_3d)
        clusters = labels
        cluster_count = int(labels.max()) + 1 if labels.max() >= 0 else 0
        logger.info(f"[KnowledgeMap] HDBSCAN: {cluster_count} clusters, {(labels == -1).sum()} noise")
    except ImportError:
        # Fallback: k-means with k=sqrt(n)
        try:
            from sklearn.cluster import KMeans
            k = max(2, min(int(n ** 0.5), 20))
            km = KMeans(n_clusters=k, random_state=req.random_state, n_init=10)
            clusters = km.fit_predict(coords_3d)
            cluster_count = k
        except Exception:
            pass
    except Exception as e:
        logger.warning(f"[KnowledgeMap] HDBSCAN failed: {e}")

    layout = [
        LayoutPoint(
            entity_id=ids[i],
            x=float(coords_3d[i, 0]),
            y=float(coords_3d[i, 1]),
            z=float(coords_3d[i, 2]),
            cluster=int(clusters[i]),
        )
        for i in range(n)
    ]

    return LayoutResponse(layout=layout, cluster_count=cluster_count, entity_count=n)


@router.post("/search", response_model=SearchResponse)
async def vector_search(req: SearchRequest):
    """
    Cosine similarity search over candidate entity vectors.
    Used as a fast in-process alternative to Qdrant for batch re-ranking.
    """
    if not req.candidate_vectors:
        return SearchResponse(results=[])

    query = np.array(req.query_vector, dtype=np.float32)
    results = []
    for e in req.candidate_vectors:
        vec = np.array(e.vector, dtype=np.float32)
        score = _cosine_similarity(query, vec)
        results.append(SearchResult(entity_id=e.entity_id, score=score))

    results.sort(key=lambda r: r.score, reverse=True)
    return SearchResponse(results=results[: req.top_k])
