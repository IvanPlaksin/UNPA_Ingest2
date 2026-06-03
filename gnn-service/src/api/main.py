"""
FastAPI application for GNN Service
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from .health_routes import router as health_router
from .knowledge_map_routes import router as knowledge_map_router
from ..config import CONFIG

# Optional routes that depend on torch/heavy ML packages
try:
    from .routes import router
    _gnn_router = router
except (ImportError, Exception) as _e:
    print(f"[GNN] GNN routes unavailable (torch not installed): {_e}")
    _gnn_router = None

try:
    from .dspy_routes import router as dspy_router
    _dspy_router = dspy_router
except (ImportError, Exception) as _e:
    print(f"[GNN] DSPy routes unavailable: {_e}")
    _dspy_router = None

try:
    from .model_routes import router as model_router
    _model_router = model_router
except (ImportError, Exception) as _e:
    print(f"[GNN] Model routes unavailable: {_e}")
    _model_router = None

try:
    from .petri_routes import router as petri_router
    _petri_router = petri_router
except (ImportError, Exception) as _e:
    print(f"[GNN] Petri routes unavailable: {_e}")
    _petri_router = None

app = FastAPI(
    title="UN ProjectAdvisor GNN Service",
    description="Graph Neural Network service for link prediction, node classification, and graph similarity",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(health_router)                                            # /health, /health/ready, /health/live
app.include_router(knowledge_map_router, prefix="/api/v1/knowledge-map")    # /api/v1/knowledge-map/...
if _model_router:
    app.include_router(_model_router)                                        # /api/v1/models/...
if _gnn_router:
    app.include_router(_gnn_router, prefix="/api/v1/gnn")                   # /api/v1/gnn/...
if _dspy_router:
    app.include_router(_dspy_router, prefix="/api/v1")                      # /api/v1/dspy/...
if _petri_router:
    app.include_router(_petri_router, prefix="/petri")                      # /petri/...

# Prometheus metrics endpoint
try:
    from prometheus_client import make_asgi_app
    metrics_app = make_asgi_app()
    app.mount("/metrics", metrics_app)
except ImportError:
    pass  # prometheus_client not installed


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "UN ProjectAdvisor GNN Service",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "health_ready": "/health/ready",
            "health_live": "/health/live",
            "models": "/api/v1/models",
            "gnn_api": "/api/v1/gnn",
            "dspy_api": "/api/v1/dspy",
            "petri_api": "/petri",
            "metrics": "/metrics",
            "docs": "/docs"
        }
    }


def run_server():
    """Run the API server"""
    uvicorn.run(
        "src.api.main:app",
        host="0.0.0.0",
        port=CONFIG['service']['port'],
        reload=CONFIG['service']['debug']
    )


if __name__ == "__main__":
    run_server()
