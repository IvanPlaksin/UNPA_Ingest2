"""
REST API for model version management — Phase C3.1

Endpoints for listing, activating, comparing, and managing GNN model versions.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from ..models.registry import ModelRegistry

router = APIRouter(prefix="/api/v1/models", tags=["models"])

# Lazy initialization
_registry = None


def get_registry() -> ModelRegistry:
    global _registry
    if _registry is None:
        _registry = ModelRegistry("checkpoints")
    return _registry


# ═══ REQUEST/RESPONSE MODELS ═══

class ActivateRequest(BaseModel):
    version: str


class CompareRequest(BaseModel):
    version_a: str
    version_b: str


# ═══ ENDPOINTS ═══

@router.get("/types")
async def list_model_types():
    """List all available model types."""
    return {
        "types": ["link_prediction", "node_classification"],
        "description": {
            "link_prediction": "Predicts probability of edge between nodes",
            "node_classification": "Classifies nodes into aggregated categories"
        }
    }


@router.get("/{model_type}/versions")
async def list_versions(model_type: str):
    """List all versions of a model type."""
    registry = get_registry()
    versions = registry.list_models(model_type)
    return {"model_type": model_type, "versions": versions, "count": len(versions)}


@router.get("/{model_type}/active")
async def get_active(model_type: str):
    """Get currently active model version."""
    registry = get_registry()
    model = registry.get_active_model(model_type)

    if not model:
        raise HTTPException(404, f"No active model for {model_type}")

    return {"model_type": model_type, **model}


@router.post("/{model_type}/activate")
async def activate_version(model_type: str, request: ActivateRequest):
    """Activate a specific model version for inference."""
    registry = get_registry()

    success = registry.activate_model(model_type, request.version)
    if not success:
        raise HTTPException(404, f"Version {request.version} not found for {model_type}")

    return {
        "status": "activated",
        "model_type": model_type,
        "version": request.version,
        "message": "Model will be loaded on next prediction request"
    }


@router.get("/{model_type}/best")
async def get_best(model_type: str, metric: str = "auc"):
    """Get best performing model version by metric."""
    registry = get_registry()
    model = registry.get_best_model(model_type, metric)

    if not model:
        raise HTTPException(404, f"No models found for {model_type}")

    return {"model_type": model_type, "metric_used": metric, **model}


@router.post("/{model_type}/compare")
async def compare_versions(model_type: str, request: CompareRequest):
    """Compare metrics between two model versions."""
    registry = get_registry()

    try:
        comparison = registry.compare_versions(
            model_type,
            request.version_a,
            request.version_b
        )

        diff = comparison.get('diff', {})
        improvements = sum(1 for m in diff.values() if m.get('improved', False))
        total = len(diff)

        if total == 0:
            recommendation = "No comparable metrics"
        elif improvements > total / 2:
            recommendation = f"Version {request.version_b} is better ({improvements}/{total} metrics improved)"
        elif improvements < total / 2:
            recommendation = f"Version {request.version_a} is better"
        else:
            recommendation = "Versions are comparable"

        return {
            "model_type": model_type,
            "version_a": request.version_a,
            "version_b": request.version_b,
            "metrics_diff": diff,
            "recommendation": recommendation
        }

    except ValueError as e:
        raise HTTPException(404, str(e))


@router.delete("/{model_type}/versions/{version}")
async def delete_version(model_type: str, version: str):
    """Delete a specific model version (cannot delete active version)."""
    registry = get_registry()

    active = registry.get_active_model(model_type)
    if active and active.get('version') == version:
        raise HTTPException(400, "Cannot delete active model version. Activate another version first.")

    success = registry.delete_model(model_type, version)
    if not success:
        raise HTTPException(404, f"Version {version} not found for {model_type}")

    return {"status": "deleted", "model_type": model_type, "version": version}


# ═══ AUTO-RETRAIN ENDPOINTS ═══

@router.get("/retrain/status")
async def retrain_status():
    """Get auto-retrain scheduler status."""
    from ..training.auto_retrain import get_scheduler
    scheduler = get_scheduler()
    return scheduler.get_status()


@router.post("/retrain/trigger/{model_type}")
async def trigger_retrain(model_type: str, reason: str = "Manual API trigger"):
    """Manually trigger model retraining."""
    if model_type not in ['link_prediction', 'node_classification']:
        raise HTTPException(400, f"Unknown model type: {model_type}")

    from ..training.auto_retrain import get_scheduler
    scheduler = get_scheduler()
    result = await scheduler.trigger_retrain(model_type, reason)
    return result


@router.post("/retrain/start")
async def start_scheduler():
    """Start the auto-retrain scheduler background loop."""
    from ..training.auto_retrain import get_scheduler
    scheduler = get_scheduler()
    await scheduler.start()
    return {"status": "started", "check_interval_minutes": scheduler.config['check_interval_minutes']}


@router.post("/retrain/stop")
async def stop_scheduler():
    """Stop the auto-retrain scheduler."""
    from ..training.auto_retrain import get_scheduler
    scheduler = get_scheduler()
    await scheduler.stop()
    return {"status": "stopped"}


@router.put("/retrain/config")
async def update_retrain_config(config: Dict[str, Any]):
    """Update scheduler configuration (partial update)."""
    from ..training.auto_retrain import get_scheduler
    scheduler = get_scheduler()
    scheduler.config.update(config)
    return {"status": "updated", "config": scheduler.config}
