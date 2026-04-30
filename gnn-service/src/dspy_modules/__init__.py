"""
DSPy Modules for UNPA Knowledge Graph Pipeline

Automatic prompt optimization using DSPy framework for:
- Entity extraction
- Relation extraction
- Task planning
- Graph verification

Uses MIPROv2 for Bayesian prompt optimization.
"""

from .signatures import (
    EntityExtraction,
    RelationExtraction,
    TaskPlanning,
    GraphVerification,
    ClaimVerification
)
from .entity_extraction import EntityExtractor
from .relation_extraction import RelationExtractor
from .task_planning import TaskPlanner
from .graph_verification import GraphVerifier
from .optimizer import PromptOptimizer, OptimizationConfig

__all__ = [
    # Signatures
    'EntityExtraction',
    'RelationExtraction',
    'TaskPlanning',
    'GraphVerification',
    'ClaimVerification',
    # Modules
    'EntityExtractor',
    'RelationExtractor',
    'TaskPlanner',
    'GraphVerifier',
    # Optimizer
    'PromptOptimizer',
    'OptimizationConfig'
]

__version__ = '0.1.0'
