"""
REST API Routes for DSPy Modules

Exposes DSPy extraction and optimization capabilities via FastAPI.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
import json

# Import DSPy modules
from ..dspy_modules import (
    EntityExtractor,
    RelationExtractor,
    TaskPlanner,
    GraphVerifier,
    PromptOptimizer,
    OptimizationConfig
)
from ..dspy_modules.relation_extraction import KnowledgeGraphExtractor
from ..dspy_modules.graph_verification import IterativeCorrector
from ..dspy_modules.optimizer import (
    create_entity_examples,
    create_relation_examples,
    create_kg_examples,
    entity_extraction_metric,
    relation_extraction_metric,
    combined_kg_metric
)

router = APIRouter(prefix="/dspy", tags=["DSPy"])


# ═══════════════════════════════════════════════════════════════════════════════
# REQUEST/RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class ExtractionRequest(BaseModel):
    text: str = Field(..., description="Text to extract from")
    context: str = Field("", description="Optional context")
    use_cot: bool = Field(False, description="Use Chain-of-Thought")
    use_ontology: bool = Field(True, description="Constrain to ontology")


class RelationExtractionRequest(BaseModel):
    text: str = Field(..., description="Text containing entity mentions")
    entities: List[Dict[str, Any]] = Field(..., description="Pre-extracted entities")
    use_cot: bool = Field(False, description="Use Chain-of-Thought")


class FullExtractionRequest(BaseModel):
    text: str = Field(..., description="Text for full KG extraction")
    context: str = Field("", description="Optional context")
    use_cot: bool = Field(False, description="Use Chain-of-Thought")
    verify: bool = Field(True, description="Verify extraction")
    auto_correct: bool = Field(False, description="Apply iterative correction")


class VerificationRequest(BaseModel):
    entities: List[Dict[str, Any]] = Field(..., description="Entities to verify")
    relations: List[Dict[str, Any]] = Field(..., description="Relations to verify")
    source_text: str = Field(..., description="Original source text")
    verify_claims: bool = Field(True, description="Verify individual claims")


class PlanningRequest(BaseModel):
    text: str = Field(..., description="Text to plan extraction for")
    text_type: str = Field("auto", description="Type of text or 'auto'")


class OptimizationRequest(BaseModel):
    module_type: str = Field(..., description="Module to optimize: entity, relation, kg, verifier")
    training_data: List[Dict[str, Any]] = Field(..., description="Training examples")
    optimizer: str = Field("miprov2", description="Optimizer: miprov2, bootstrap, bootstrap_random")
    num_trials: int = Field(30, ge=5, le=100)


class EntityResult(BaseModel):
    entities: List[Dict[str, Any]]
    entity_count: int
    raw_output: Optional[str] = None


class RelationResult(BaseModel):
    relations: List[Dict[str, Any]]
    valid_relations: List[Dict[str, Any]]
    invalid_relations: List[Dict[str, Any]]
    relation_count: int


class FullExtractionResult(BaseModel):
    entities: List[Dict[str, Any]]
    relations: List[Dict[str, Any]]
    entity_count: int
    relation_count: int
    verification: Optional[Dict[str, Any]] = None
    corrections_applied: int = 0


class VerificationResult(BaseModel):
    score: float
    grade: str
    issue_count: int
    issues: List[Dict[str, Any]]
    valid_entities: List[Dict[str, Any]]
    valid_relations: List[Dict[str, Any]]


class PlanResult(BaseModel):
    text_type: str
    complexity: str
    steps: List[Dict[str, Any]]
    estimated_entities: int
    estimated_relations: int
    chunking_needed: bool


# ═══════════════════════════════════════════════════════════════════════════════
# MODULE INSTANCES (Lazy initialization)
# ═══════════════════════════════════════════════════════════════════════════════

_modules = {}
_optimizer = None
_optimization_jobs = {}


def get_entity_extractor(use_cot: bool = False, use_ontology: bool = True) -> EntityExtractor:
    """Get or create entity extractor."""
    key = f"entity_{use_cot}_{use_ontology}"
    if key not in _modules:
        _modules[key] = EntityExtractor(use_cot=use_cot, use_ontology=use_ontology)
    return _modules[key]


def get_relation_extractor(use_cot: bool = False) -> RelationExtractor:
    """Get or create relation extractor."""
    key = f"relation_{use_cot}"
    if key not in _modules:
        _modules[key] = RelationExtractor(use_cot=use_cot)
    return _modules[key]


def get_kg_extractor(use_cot: bool = False) -> KnowledgeGraphExtractor:
    """Get or create KG extractor."""
    key = f"kg_{use_cot}"
    if key not in _modules:
        _modules[key] = KnowledgeGraphExtractor(use_cot=use_cot)
    return _modules[key]


def get_verifier(use_cot: bool = True) -> GraphVerifier:
    """Get or create graph verifier."""
    key = f"verifier_{use_cot}"
    if key not in _modules:
        _modules[key] = GraphVerifier(use_cot=use_cot)
    return _modules[key]


def get_planner() -> TaskPlanner:
    """Get or create task planner."""
    if "planner" not in _modules:
        _modules["planner"] = TaskPlanner()
    return _modules["planner"]


def get_optimizer() -> PromptOptimizer:
    """Get or create prompt optimizer."""
    global _optimizer
    if _optimizer is None:
        _optimizer = PromptOptimizer()
    return _optimizer


# ═══════════════════════════════════════════════════════════════════════════════
# EXTRACTION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/extract/entities", response_model=EntityResult)
async def extract_entities(request: ExtractionRequest):
    """Extract entities from text."""
    try:
        extractor = get_entity_extractor(
            use_cot=request.use_cot,
            use_ontology=request.use_ontology
        )

        result = extractor(
            text=request.text,
            context=request.context
        )

        return EntityResult(
            entities=result.parsed_entities,
            entity_count=len(result.parsed_entities),
            raw_output=result.entities
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Entity extraction failed: {str(e)}")


@router.post("/extract/relations", response_model=RelationResult)
async def extract_relations(request: RelationExtractionRequest):
    """Extract relations from text given entities."""
    try:
        extractor = get_relation_extractor(use_cot=request.use_cot)

        result = extractor(
            text=request.text,
            entities=request.entities
        )

        valid = [r for r in result.parsed_relations if r.get('valid', True)]
        invalid = [r for r in result.parsed_relations if not r.get('valid', True)]

        return RelationResult(
            relations=result.parsed_relations,
            valid_relations=valid,
            invalid_relations=invalid,
            relation_count=len(result.parsed_relations)
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Relation extraction failed: {str(e)}")


@router.post("/extract/kg", response_model=FullExtractionResult)
async def extract_knowledge_graph(request: FullExtractionRequest):
    """Extract full knowledge graph (entities + relations)."""
    try:
        extractor = get_kg_extractor(use_cot=request.use_cot)

        result = extractor(
            text=request.text,
            context=request.context
        )

        verification = None
        corrections = 0

        if request.verify:
            verifier = get_verifier()
            ver_result = verifier(
                entities=result.parsed_entities,
                relations=result.parsed_relations,
                source_text=request.text
            )
            verification = ver_result.report.to_dict()

        if request.auto_correct and request.verify:
            corrector = IterativeCorrector()
            corrected = corrector(
                entities=result.parsed_entities,
                relations=result.parsed_relations,
                source_text=request.text
            )
            result.parsed_entities = corrected.entities
            result.parsed_relations = corrected.relations
            corrections = len(corrected.iterations)

        return FullExtractionResult(
            entities=result.parsed_entities,
            relations=result.parsed_relations,
            entity_count=len(result.parsed_entities),
            relation_count=len(result.parsed_relations),
            verification=verification,
            corrections_applied=corrections
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"KG extraction failed: {str(e)}")


# ═══════════════════════════════════════════════════════════════════════════════
# VERIFICATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/verify", response_model=VerificationResult)
async def verify_extraction(request: VerificationRequest):
    """Verify extracted graph against source text."""
    try:
        verifier = get_verifier()

        result = verifier(
            entities=request.entities,
            relations=request.relations,
            source_text=request.source_text
        )

        return VerificationResult(
            score=result.score,
            grade=result.grade,
            issue_count=result.issue_count,
            issues=[i.to_dict() for i in result.report.issues],
            valid_entities=result.report.valid_entities,
            valid_relations=result.report.valid_relations
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")


@router.post("/verify/correct")
async def verify_and_correct(request: VerificationRequest):
    """Verify and iteratively correct extraction."""
    try:
        corrector = IterativeCorrector()

        result = corrector(
            entities=request.entities,
            relations=request.relations,
            source_text=request.source_text
        )

        return {
            "entities": result.entities,
            "relations": result.relations,
            "initial_entities": result.initial_entities,
            "initial_relations": result.initial_relations,
            "final_score": result.final_score,
            "final_grade": result.final_grade,
            "iterations": result.iterations,
            "improvement": result.improvement
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Correction failed: {str(e)}")


# ═══════════════════════════════════════════════════════════════════════════════
# PLANNING ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/plan", response_model=PlanResult)
async def plan_extraction(request: PlanningRequest):
    """Plan extraction pipeline for text."""
    try:
        planner = get_planner()

        result = planner(
            text=request.text,
            text_type=request.text_type
        )

        return PlanResult(
            text_type=result.text_type,
            complexity=result.complexity,
            steps=[s.to_dict() for s in result.plan.steps],
            estimated_entities=result.plan.estimated_entities,
            estimated_relations=result.plan.estimated_relations,
            chunking_needed=result.plan.chunking_needed
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Planning failed: {str(e)}")


# ═══════════════════════════════════════════════════════════════════════════════
# OPTIMIZATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/optimize")
async def start_optimization(
    request: OptimizationRequest,
    background_tasks: BackgroundTasks
):
    """Start prompt optimization as background task."""
    job_id = f"opt-{request.module_type}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

    _optimization_jobs[job_id] = {
        "status": "queued",
        "module_type": request.module_type,
        "started_at": datetime.now().isoformat(),
        "progress": 0
    }

    background_tasks.add_task(
        run_optimization_job,
        job_id,
        request.module_type,
        request.training_data,
        request.optimizer,
        request.num_trials
    )

    return {"job_id": job_id, "status": "queued"}


@router.get("/optimize/{job_id}")
async def get_optimization_status(job_id: str):
    """Get status of optimization job."""
    if job_id not in _optimization_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return _optimization_jobs[job_id]


async def run_optimization_job(
    job_id: str,
    module_type: str,
    training_data: List[Dict],
    optimizer_type: str,
    num_trials: int
):
    """Background optimization job."""
    try:
        _optimization_jobs[job_id]["status"] = "running"

        # Create examples based on module type
        if module_type == "entity":
            examples = create_entity_examples(training_data)
            module = EntityExtractor()
            metric = entity_extraction_metric
        elif module_type == "relation":
            examples = create_relation_examples(training_data)
            module = RelationExtractor()
            metric = relation_extraction_metric
        elif module_type == "kg":
            examples = create_kg_examples(training_data)
            module = KnowledgeGraphExtractor()
            metric = combined_kg_metric
        else:
            raise ValueError(f"Unknown module type: {module_type}")

        # Create optimizer
        config = OptimizationConfig(
            optimizer=optimizer_type,
            num_trials=num_trials,
            experiment_name=f"unpa_{module_type}"
        )
        optimizer = PromptOptimizer(config)

        # Run optimization
        optimized = optimizer.optimize_module(
            module=module,
            trainset=examples,
            metric=metric,
            module_name=module_type
        )

        # Update job status
        _optimization_jobs[job_id]["status"] = "completed"
        _optimization_jobs[job_id]["completed_at"] = datetime.now().isoformat()
        _optimization_jobs[job_id]["history"] = optimizer.get_optimization_history()

        # Cache optimized module
        _modules[f"{module_type}_optimized"] = optimized

    except Exception as e:
        _optimization_jobs[job_id]["status"] = "failed"
        _optimization_jobs[job_id]["error"] = str(e)


@router.get("/optimize/history")
async def get_optimization_history():
    """Get all optimization history."""
    optimizer = get_optimizer()
    return {"history": optimizer.get_optimization_history()}


# ═══════════════════════════════════════════════════════════════════════════════
# STATUS ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/status")
async def get_dspy_status():
    """Get DSPy module status."""
    return {
        "loaded_modules": list(_modules.keys()),
        "optimization_jobs": {
            job_id: {
                "status": job["status"],
                "module_type": job.get("module_type")
            }
            for job_id, job in _optimization_jobs.items()
        },
        "available_modules": [
            "EntityExtractor",
            "RelationExtractor",
            "KnowledgeGraphExtractor",
            "GraphVerifier",
            "TaskPlanner",
            "IterativeCorrector"
        ],
        "available_optimizers": ["miprov2", "bootstrap", "bootstrap_random"]
    }


@router.delete("/modules/cache")
async def clear_module_cache():
    """Clear cached modules."""
    _modules.clear()
    return {"status": "success", "message": "Module cache cleared"}
