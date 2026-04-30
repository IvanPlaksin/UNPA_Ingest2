"""
DSPy Signatures for Knowledge Graph Operations

Defines type-safe input/output contracts for LLM-based extraction and verification.
These signatures are optimized via MIPROv2 during the training phase.
"""

import dspy
from typing import List, Optional


# ═══════════════════════════════════════════════════════════════════════════════
# ENTITY EXTRACTION SIGNATURES
# ═══════════════════════════════════════════════════════════════════════════════

class EntityExtraction(dspy.Signature):
    """Extract named entities from Azure DevOps text with type and confidence.

    Focus on: WorkItem, File, User, Team, Repository, Sprint, Area, Tag,
    Commit, Branch, PullRequest, Pipeline, Release, TestCase, Bug, Feature.
    """

    text: str = dspy.InputField(
        desc="Source text to extract entities from (work item description, commit message, etc.)"
    )
    context: Optional[str] = dspy.InputField(
        default="",
        desc="Optional context about the source (project name, work item type, etc.)"
    )

    entities: str = dspy.OutputField(
        desc="JSON array of entities: [{name, type, confidence, start_pos, end_pos}]"
    )


class EntityExtractionWithOntology(dspy.Signature):
    """Extract entities constrained by AOPEG ontology schema.

    Only extract entities matching allowed types in the ontology.
    Validate entity names against naming conventions.
    """

    text: str = dspy.InputField(desc="Source text for entity extraction")
    ontology_types: str = dspy.InputField(
        desc="Comma-separated list of allowed entity types from ontology"
    )
    naming_patterns: Optional[str] = dspy.InputField(
        default="",
        desc="Optional regex patterns for entity name validation"
    )

    entities: str = dspy.OutputField(
        desc="JSON array of validated entities: [{name, type, confidence, validated: bool}]"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# RELATION EXTRACTION SIGNATURES
# ═══════════════════════════════════════════════════════════════════════════════

class RelationExtraction(dspy.Signature):
    """Extract relationships between entities from text.

    Focus on: ASSIGNED_TO, MENTIONS, DEPENDS_ON, PARENT_OF, RELATED_TO,
    AUTHORED_BY, MODIFIED_BY, CONTAINS, IMPLEMENTS, REFERENCES, etc.
    """

    text: str = dspy.InputField(desc="Source text containing entity mentions")
    entities: str = dspy.InputField(
        desc="JSON array of pre-extracted entities: [{name, type}]"
    )

    relations: str = dspy.OutputField(
        desc="JSON array of relations: [{source, target, relation_type, confidence, evidence}]"
    )


class RelationExtractionWithConstraints(dspy.Signature):
    """Extract relations with ontology domain/range constraints.

    Validates that source entity type matches domain and target matches range.
    """

    text: str = dspy.InputField(desc="Source text")
    entities: str = dspy.InputField(desc="Pre-extracted entities JSON")
    constraints: str = dspy.InputField(
        desc="JSON object: {relation_type: {domain: [types], range: [types]}}"
    )

    relations: str = dspy.OutputField(
        desc="JSON array with validation: [{source, target, type, valid: bool, reason}]"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# TASK PLANNING SIGNATURES
# ═══════════════════════════════════════════════════════════════════════════════

class TaskPlanning(dspy.Signature):
    """Plan extraction pipeline steps for a given text input.

    Analyzes text characteristics and selects optimal processing strategy.
    """

    text: str = dspy.InputField(desc="Input text to analyze")
    text_type: str = dspy.InputField(
        desc="Type of text: work_item, commit, pr_description, comment, etc."
    )
    available_extractors: str = dspy.InputField(
        desc="Comma-separated list of available extractor modules"
    )

    plan: str = dspy.OutputField(
        desc="JSON execution plan: {steps: [{module, config, reason}], estimated_entities, estimated_relations}"
    )


class TaskDecomposition(dspy.Signature):
    """Decompose complex extraction task into subtasks.

    Used for large texts or multi-document extraction.
    """

    task_description: str = dspy.InputField(desc="High-level extraction task")
    text_size: int = dspy.InputField(desc="Character count of input text")
    complexity_hints: Optional[str] = dspy.InputField(
        default="",
        desc="Hints about text complexity (nested structures, code blocks, etc.)"
    )

    subtasks: str = dspy.OutputField(
        desc="JSON array of subtasks: [{id, description, dependencies: [ids], priority}]"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# GRAPH VERIFICATION SIGNATURES
# ═══════════════════════════════════════════════════════════════════════════════

class GraphVerification(dspy.Signature):
    """Verify extracted graph against source text for hallucinations.

    Implements PiVe-style verification: check each claim against evidence.
    """

    entities: str = dspy.InputField(desc="JSON array of extracted entities")
    relations: str = dspy.InputField(desc="JSON array of extracted relations")
    source_text: str = dspy.InputField(desc="Original source text for verification")

    verification: str = dspy.OutputField(
        desc="JSON: {score, issues: [{type, element, reason, suggestion}], valid_entities, valid_relations}"
    )


class ClaimVerification(dspy.Signature):
    """Verify single claim against source evidence.

    Returns verdict: grounded, uncertain, or hallucinated.
    """

    claim: str = dspy.InputField(desc="Claim to verify (entity or relation assertion)")
    evidence: str = dspy.InputField(desc="Source text passage as evidence")

    verdict: str = dspy.OutputField(
        desc="JSON: {verdict: 'grounded'|'uncertain'|'hallucinated', confidence, reasoning}"
    )


class OntologyValidation(dspy.Signature):
    """Validate extraction against ontology constraints.

    Checks: valid types, domain/range constraints, cardinality limits.
    """

    entities: str = dspy.InputField(desc="Extracted entities JSON")
    relations: str = dspy.InputField(desc="Extracted relations JSON")
    ontology_schema: str = dspy.InputField(
        desc="JSON ontology: {entity_types, relation_types, constraints}"
    )

    validation: str = dspy.OutputField(
        desc="JSON: {conformance_score, violations: [{type, element, constraint, fix}]}"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# CORRECTION/REFINEMENT SIGNATURES
# ═══════════════════════════════════════════════════════════════════════════════

class EntityCorrection(dspy.Signature):
    """Correct entity extraction errors based on verification feedback."""

    entities: str = dspy.InputField(desc="Original extracted entities JSON")
    issues: str = dspy.InputField(desc="JSON array of detected issues")
    source_text: str = dspy.InputField(desc="Original source text")

    corrected_entities: str = dspy.OutputField(
        desc="JSON array of corrected entities with changes explained"
    )


class RelationCorrection(dspy.Signature):
    """Correct relation extraction errors based on verification feedback."""

    relations: str = dspy.InputField(desc="Original extracted relations JSON")
    issues: str = dspy.InputField(desc="JSON array of detected issues")
    entities: str = dspy.InputField(desc="Valid entities for reference")
    source_text: str = dspy.InputField(desc="Original source text")

    corrected_relations: str = dspy.OutputField(
        desc="JSON array of corrected relations with changes explained"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# COMPOSITE SIGNATURES (Chain of Thought)
# ═══════════════════════════════════════════════════════════════════════════════

class FullExtractionWithCoT(dspy.Signature):
    """Complete extraction with step-by-step reasoning.

    Uses Chain-of-Thought for complex extraction scenarios.
    """

    text: str = dspy.InputField(desc="Source text for extraction")
    context: Optional[str] = dspy.InputField(default="", desc="Additional context")

    reasoning: str = dspy.OutputField(
        desc="Step-by-step extraction reasoning"
    )
    entities: str = dspy.OutputField(desc="Extracted entities JSON")
    relations: str = dspy.OutputField(desc="Extracted relations JSON")
    confidence: float = dspy.OutputField(desc="Overall extraction confidence 0-1")
