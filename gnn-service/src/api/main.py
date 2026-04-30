"""
FastAPI application for GNN Service
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from .routes import router
from .dspy_routes import router as dspy_router
from .model_routes import router as model_router
from .health_routes import router as health_router
from ..config import CONFIG

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
app.include_router(health_router)                       # /health, /health/ready, /health/live
app.include_router(model_router)                         # /api/v1/models/...
app.include_router(router, prefix="/api/v1/gnn")         # /api/v1/gnn/...
app.include_router(dspy_router, prefix="/api/v1")        # /api/v1/dspy/...

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
