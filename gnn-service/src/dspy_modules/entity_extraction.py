"""
DSPy Entity Extraction Module

Extracts named entities from text using optimizable prompts.
Supports both basic extraction and ontology-constrained extraction.
"""

import dspy
import json
import re
from typing import List, Dict, Any, Optional

from .signatures import EntityExtraction, EntityExtractionWithOntology


# ═══════════════════════════════════════════════════════════════════════════════
# AOPEG ENTITY TYPES
# ═══════════════════════════════════════════════════════════════════════════════

AOPEG_ENTITY_TYPES = [
    # Azure DevOps Core
    'WorkItem', 'Bug', 'Feature', 'Task', 'UserStory', 'Epic',
    'User', 'Team', 'Project', 'Organization',
    # Code
    'Repository', 'Branch', 'Commit', 'PullRequest', 'File', 'CodeReview',
    # Pipeline
    'Pipeline', 'Build', 'Release', 'Artifact', 'Environment',
    # Work Management
    'Sprint', 'Iteration', 'Area', 'Tag', 'Query',
    # Testing
    'TestPlan', 'TestSuite', 'TestCase', 'TestRun', 'TestResult',
    # Documentation
    'Wiki', 'WikiPage', 'Document',
    # Knowledge
    'Concept', 'Decision', 'Requirement', 'Constraint'
]


# ═══════════════════════════════════════════════════════════════════════════════
# ENTITY EXTRACTOR MODULE
# ═══════════════════════════════════════════════════════════════════════════════

class EntityExtractor(dspy.Module):
    """DSPy module for entity extraction with automatic prompt optimization."""

    def __init__(
        self,
        use_cot: bool = False,
        use_ontology: bool = True,
        ontology_types: Optional[List[str]] = None
    ):
        """
        Initialize entity extractor.

        Args:
            use_cot: Use Chain-of-Thought reasoning
            use_ontology: Constrain to ontology types
            ontology_types: Custom entity types (defaults to AOPEG)
        """
        super().__init__()

        self.use_ontology = use_ontology
        self.ontology_types = ontology_types or AOPEG_ENTITY_TYPES

        if use_ontology:
            if use_cot:
                self.extractor = dspy.ChainOfThought(EntityExtractionWithOntology)
            else:
                self.extractor = dspy.Predict(EntityExtractionWithOntology)
        else:
            if use_cot:
                self.extractor = dspy.ChainOfThought(EntityExtraction)
            else:
                self.extractor = dspy.Predict(EntityExtraction)

    def forward(
        self,
        text: str,
        context: str = "",
        naming_patterns: str = ""
    ) -> dspy.Prediction:
        """
        Extract entities from text.

        Args:
            text: Source text for extraction
            context: Optional context about the text
            naming_patterns: Optional regex patterns for validation

        Returns:
            dspy.Prediction with entities field
        """
        if not text or not text.strip():
            return dspy.Prediction(
                entities="[]",
                parsed_entities=[]
            )

        if self.use_ontology:
            result = self.extractor(
                text=text,
                ontology_types=", ".join(self.ontology_types),
                naming_patterns=naming_patterns
            )
        else:
            result = self.extractor(
                text=text,
                context=context
            )

        # Parse and validate entities
        parsed_entities = self._parse_entities(result.entities)

        return dspy.Prediction(
            entities=result.entities,
            parsed_entities=parsed_entities,
            raw_result=result
        )

    def _parse_entities(self, entities_json: str) -> List[Dict[str, Any]]:
        """Parse and validate entity JSON output."""
        try:
            # Handle markdown code blocks
            if "```json" in entities_json:
                match = re.search(r'```json\s*(.*?)\s*```', entities_json, re.DOTALL)
                if match:
                    entities_json = match.group(1)
            elif "```" in entities_json:
                match = re.search(r'```\s*(.*?)\s*```', entities_json, re.DOTALL)
                if match:
                    entities_json = match.group(1)

            entities = json.loads(entities_json)

            if not isinstance(entities, list):
                entities = [entities]

            # Normalize entity format
            normalized = []
            for entity in entities:
                if isinstance(entity, dict):
                    normalized.append({
                        'name': entity.get('name', entity.get('entity', '')),
                        'type': entity.get('type', entity.get('entity_type', 'Unknown')),
                        'confidence': float(entity.get('confidence', 0.8)),
                        'start_pos': entity.get('start_pos', entity.get('start', None)),
                        'end_pos': entity.get('end_pos', entity.get('end', None)),
                        'validated': entity.get('validated', True)
                    })

            return normalized

        except (json.JSONDecodeError, TypeError, ValueError) as e:
            # Fallback: try to extract entities from malformed output
            return self._fallback_parse(entities_json)

    def _fallback_parse(self, text: str) -> List[Dict[str, Any]]:
        """Fallback parser for malformed entity output."""
        entities = []

        # Try to find entity patterns
        patterns = [
            r'"name":\s*"([^"]+)".*?"type":\s*"([^"]+)"',
            r'name:\s*([^\n,]+).*?type:\s*([^\n,]+)',
            r'(\w+)\s*\((\w+)\)',  # Entity (Type) format
        ]

        for pattern in patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE | re.DOTALL):
                name = match.group(1).strip()
                entity_type = match.group(2).strip()

                if name and entity_type and entity_type in AOPEG_ENTITY_TYPES:
                    entities.append({
                        'name': name,
                        'type': entity_type,
                        'confidence': 0.5,  # Lower confidence for fallback
                        'validated': False
                    })

        return entities


# ═══════════════════════════════════════════════════════════════════════════════
# BATCH ENTITY EXTRACTOR
# ═══════════════════════════════════════════════════════════════════════════════

class BatchEntityExtractor(dspy.Module):
    """Extract entities from multiple texts efficiently."""

    def __init__(
        self,
        use_cot: bool = False,
        use_ontology: bool = True,
        merge_duplicates: bool = True
    ):
        super().__init__()
        self.extractor = EntityExtractor(use_cot=use_cot, use_ontology=use_ontology)
        self.merge_duplicates = merge_duplicates

    def forward(self, texts: List[str], contexts: Optional[List[str]] = None) -> dspy.Prediction:
        """
        Extract entities from multiple texts.

        Args:
            texts: List of source texts
            contexts: Optional list of contexts (one per text)

        Returns:
            Prediction with merged entities
        """
        if contexts is None:
            contexts = [""] * len(texts)

        all_entities = []
        extraction_results = []

        for text, context in zip(texts, contexts):
            result = self.extractor(text=text, context=context)
            extraction_results.append(result)
            all_entities.extend(result.parsed_entities)

        if self.merge_duplicates:
            all_entities = self._merge_entities(all_entities)

        return dspy.Prediction(
            entities=json.dumps(all_entities),
            parsed_entities=all_entities,
            extraction_results=extraction_results,
            source_count=len(texts)
        )

    def _merge_entities(self, entities: List[Dict]) -> List[Dict]:
        """Merge duplicate entities, keeping highest confidence."""
        merged = {}

        for entity in entities:
            key = (entity['name'].lower(), entity['type'])

            if key not in merged or entity['confidence'] > merged[key]['confidence']:
                merged[key] = entity.copy()
                merged[key]['occurrence_count'] = merged.get(key, {}).get('occurrence_count', 0) + 1

        return list(merged.values())


# ═══════════════════════════════════════════════════════════════════════════════
# FACTORY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def create_entity_extractor(
    mode: str = "standard",
    ontology_types: Optional[List[str]] = None
) -> EntityExtractor:
    """
    Create entity extractor with specified mode.

    Args:
        mode: "standard", "cot" (chain of thought), "fast"
        ontology_types: Custom entity types

    Returns:
        Configured EntityExtractor
    """
    if mode == "cot":
        return EntityExtractor(use_cot=True, use_ontology=True, ontology_types=ontology_types)
    elif mode == "fast":
        return EntityExtractor(use_cot=False, use_ontology=False)
    else:
        return EntityExtractor(use_cot=False, use_ontology=True, ontology_types=ontology_types)


def create_batch_extractor(
    merge_duplicates: bool = True
) -> BatchEntityExtractor:
    """Create batch entity extractor."""
    return BatchEntityExtractor(merge_duplicates=merge_duplicates)
