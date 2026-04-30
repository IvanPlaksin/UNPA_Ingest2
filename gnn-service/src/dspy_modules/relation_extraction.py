"""
DSPy Relation Extraction Module

Extracts relationships between entities using optimizable prompts.
Supports ontology constraints with domain/range validation.
"""

import dspy
import json
import re
from typing import List, Dict, Any, Optional

from .signatures import RelationExtraction, RelationExtractionWithConstraints


# ═══════════════════════════════════════════════════════════════════════════════
# AOPEG RELATION TYPES WITH CONSTRAINTS
# ═══════════════════════════════════════════════════════════════════════════════

AOPEG_RELATION_TYPES = {
    # Assignment & Ownership
    'ASSIGNED_TO': {
        'domain': ['WorkItem', 'Bug', 'Feature', 'Task', 'UserStory', 'TestCase'],
        'range': ['User', 'Team']
    },
    'OWNED_BY': {
        'domain': ['Repository', 'Project', 'Wiki', 'Pipeline'],
        'range': ['User', 'Team', 'Organization']
    },
    'AUTHORED_BY': {
        'domain': ['Commit', 'PullRequest', 'Document', 'WikiPage', 'Comment'],
        'range': ['User']
    },
    'REVIEWED_BY': {
        'domain': ['PullRequest', 'CodeReview'],
        'range': ['User']
    },
    'MODIFIED_BY': {
        'domain': ['File', 'WikiPage', 'Document'],
        'range': ['User']
    },

    # Hierarchy & Containment
    'PARENT_OF': {
        'domain': ['Epic', 'Feature', 'UserStory', 'WorkItem'],
        'range': ['Feature', 'UserStory', 'Task', 'Bug', 'WorkItem']
    },
    'PART_OF': {
        'domain': ['File', 'Sprint', 'Iteration', 'TestCase'],
        'range': ['Repository', 'Project', 'TestSuite', 'TestPlan']
    },
    'CONTAINS': {
        'domain': ['Repository', 'Project', 'TestSuite', 'TestPlan', 'Sprint'],
        'range': ['File', 'WorkItem', 'TestCase', 'Task']
    },
    'BELONGS_TO': {
        'domain': ['WorkItem', 'User', 'Repository'],
        'range': ['Project', 'Team', 'Area', 'Organization']
    },

    # References & Dependencies
    'REFERENCES': {
        'domain': ['WorkItem', 'Commit', 'PullRequest', 'Comment', 'WikiPage'],
        'range': ['WorkItem', 'File', 'Commit', 'PullRequest', 'WikiPage', 'Concept']
    },
    'DEPENDS_ON': {
        'domain': ['WorkItem', 'Task', 'Feature', 'Pipeline', 'Build'],
        'range': ['WorkItem', 'Task', 'Feature', 'Pipeline', 'Artifact']
    },
    'BLOCKS': {
        'domain': ['WorkItem', 'Bug', 'Task'],
        'range': ['WorkItem', 'Feature', 'Task', 'Release']
    },
    'RELATED_TO': {
        'domain': None,  # Any entity
        'range': None    # Any entity
    },
    'MENTIONS': {
        'domain': ['WorkItem', 'Comment', 'PullRequest', 'Commit'],
        'range': ['User', 'WorkItem', 'File', 'Concept']
    },

    # Code Relations
    'MODIFIES': {
        'domain': ['Commit', 'PullRequest'],
        'range': ['File']
    },
    'IMPLEMENTS': {
        'domain': ['Commit', 'PullRequest', 'File'],
        'range': ['Feature', 'UserStory', 'Task', 'Requirement']
    },
    'FIXES': {
        'domain': ['Commit', 'PullRequest'],
        'range': ['Bug', 'WorkItem']
    },
    'MERGED_INTO': {
        'domain': ['Branch', 'PullRequest'],
        'range': ['Branch']
    },

    # Pipeline & Build
    'TRIGGERS': {
        'domain': ['Commit', 'PullRequest', 'Pipeline'],
        'range': ['Build', 'Pipeline', 'Release']
    },
    'PRODUCES': {
        'domain': ['Build', 'Pipeline'],
        'range': ['Artifact', 'Release']
    },
    'DEPLOYS_TO': {
        'domain': ['Release', 'Pipeline'],
        'range': ['Environment']
    },

    # Testing
    'TESTS': {
        'domain': ['TestCase', 'TestSuite'],
        'range': ['Feature', 'WorkItem', 'File']
    },
    'VERIFIES': {
        'domain': ['TestRun', 'TestResult'],
        'range': ['Requirement', 'Feature']
    },

    # Knowledge
    'DERIVED_FROM': {
        'domain': ['Concept', 'Decision', 'Document'],
        'range': ['WorkItem', 'Document', 'Concept']
    },
    'DOCUMENTS': {
        'domain': ['WikiPage', 'Document'],
        'range': ['Feature', 'Project', 'Repository', 'Decision']
    },
    'TAGGED_WITH': {
        'domain': ['WorkItem', 'WikiPage', 'Document'],
        'range': ['Tag', 'Concept']
    }
}


# ═══════════════════════════════════════════════════════════════════════════════
# RELATION EXTRACTOR MODULE
# ═══════════════════════════════════════════════════════════════════════════════

class RelationExtractor(dspy.Module):
    """DSPy module for relation extraction with automatic prompt optimization."""

    def __init__(
        self,
        use_cot: bool = False,
        use_constraints: bool = True,
        relation_types: Optional[Dict] = None
    ):
        """
        Initialize relation extractor.

        Args:
            use_cot: Use Chain-of-Thought reasoning
            use_constraints: Apply domain/range constraints
            relation_types: Custom relation schema (defaults to AOPEG)
        """
        super().__init__()

        self.use_constraints = use_constraints
        self.relation_types = relation_types or AOPEG_RELATION_TYPES

        if use_constraints:
            if use_cot:
                self.extractor = dspy.ChainOfThought(RelationExtractionWithConstraints)
            else:
                self.extractor = dspy.Predict(RelationExtractionWithConstraints)
        else:
            if use_cot:
                self.extractor = dspy.ChainOfThought(RelationExtraction)
            else:
                self.extractor = dspy.Predict(RelationExtraction)

    def forward(
        self,
        text: str,
        entities: List[Dict[str, Any]]
    ) -> dspy.Prediction:
        """
        Extract relations from text given pre-extracted entities.

        Args:
            text: Source text containing entity mentions
            entities: List of pre-extracted entities [{name, type}]

        Returns:
            dspy.Prediction with relations field
        """
        if not text or not entities:
            return dspy.Prediction(
                relations="[]",
                parsed_relations=[]
            )

        entities_json = json.dumps(entities)

        if self.use_constraints:
            constraints_json = json.dumps(self._build_constraints())
            result = self.extractor(
                text=text,
                entities=entities_json,
                constraints=constraints_json
            )
        else:
            result = self.extractor(
                text=text,
                entities=entities_json
            )

        # Parse and validate relations
        parsed_relations = self._parse_relations(result.relations, entities)

        return dspy.Prediction(
            relations=result.relations,
            parsed_relations=parsed_relations,
            raw_result=result
        )

    def _build_constraints(self) -> Dict:
        """Build constraints JSON for the signature."""
        constraints = {}
        for rel_type, schema in self.relation_types.items():
            constraints[rel_type] = {
                'domain': schema.get('domain', []),
                'range': schema.get('range', [])
            }
        return constraints

    def _parse_relations(
        self,
        relations_json: str,
        entities: List[Dict]
    ) -> List[Dict[str, Any]]:
        """Parse and validate relation JSON output."""
        try:
            # Handle markdown code blocks
            if "```json" in relations_json:
                match = re.search(r'```json\s*(.*?)\s*```', relations_json, re.DOTALL)
                if match:
                    relations_json = match.group(1)
            elif "```" in relations_json:
                match = re.search(r'```\s*(.*?)\s*```', relations_json, re.DOTALL)
                if match:
                    relations_json = match.group(1)

            relations = json.loads(relations_json)

            if not isinstance(relations, list):
                relations = [relations]

            # Build entity lookup
            entity_map = {e['name'].lower(): e for e in entities}

            # Normalize and validate relations
            validated = []
            for rel in relations:
                if isinstance(rel, dict):
                    source = rel.get('source', rel.get('source_entity', ''))
                    target = rel.get('target', rel.get('target_entity', ''))
                    rel_type = rel.get('relation_type', rel.get('type', 'RELATED_TO'))

                    # Normalize relation type
                    rel_type = rel_type.upper().replace(' ', '_')

                    # Validate entities exist
                    source_entity = entity_map.get(source.lower())
                    target_entity = entity_map.get(target.lower())

                    # Validate domain/range constraints
                    is_valid = True
                    validation_reason = ""

                    if self.use_constraints and rel_type in self.relation_types:
                        schema = self.relation_types[rel_type]

                        if source_entity and schema.get('domain'):
                            if source_entity['type'] not in schema['domain']:
                                is_valid = False
                                validation_reason = f"Invalid domain: {source_entity['type']}"

                        if target_entity and schema.get('range'):
                            if target_entity['type'] not in schema['range']:
                                is_valid = False
                                validation_reason = f"Invalid range: {target_entity['type']}"

                    validated.append({
                        'source': source,
                        'target': target,
                        'relation_type': rel_type,
                        'confidence': float(rel.get('confidence', 0.8)),
                        'evidence': rel.get('evidence', ''),
                        'valid': is_valid,
                        'validation_reason': validation_reason,
                        'source_type': source_entity['type'] if source_entity else None,
                        'target_type': target_entity['type'] if target_entity else None
                    })

            return validated

        except (json.JSONDecodeError, TypeError, ValueError):
            return self._fallback_parse(relations_json)

    def _fallback_parse(self, text: str) -> List[Dict[str, Any]]:
        """Fallback parser for malformed relation output."""
        relations = []

        # Try to find relation patterns
        patterns = [
            r'"source":\s*"([^"]+)".*?"target":\s*"([^"]+)".*?"(?:relation_)?type":\s*"([^"]+)"',
            r'(\w+)\s*-\[(\w+)\]->\s*(\w+)',  # Entity -[REL]-> Entity format
            r'(\w+)\s+(\w+)\s+(\w+)',  # Simple triple format
        ]

        for pattern in patterns[:2]:  # Use only structured patterns
            for match in re.finditer(pattern, text, re.IGNORECASE | re.DOTALL):
                if len(match.groups()) >= 3:
                    source = match.group(1).strip()
                    rel_type = match.group(2).strip() if len(match.groups()) == 3 else match.group(3).strip()
                    target = match.group(3).strip() if len(match.groups()) == 3 else match.group(2).strip()

                    # Swap for arrow pattern
                    if '->' in text:
                        target = match.group(3).strip()
                        rel_type = match.group(2).strip()

                    relations.append({
                        'source': source,
                        'target': target,
                        'relation_type': rel_type.upper().replace(' ', '_'),
                        'confidence': 0.5,
                        'valid': False,
                        'validation_reason': 'Fallback parse'
                    })

        return relations


# ═══════════════════════════════════════════════════════════════════════════════
# COMBINED EXTRACTOR (ENTITIES + RELATIONS)
# ═══════════════════════════════════════════════════════════════════════════════

class KnowledgeGraphExtractor(dspy.Module):
    """Combined entity and relation extraction for full KG building."""

    def __init__(
        self,
        use_cot: bool = False,
        use_constraints: bool = True
    ):
        super().__init__()

        from .entity_extraction import EntityExtractor

        self.entity_extractor = EntityExtractor(use_cot=use_cot, use_ontology=use_constraints)
        self.relation_extractor = RelationExtractor(use_cot=use_cot, use_constraints=use_constraints)

    def forward(self, text: str, context: str = "") -> dspy.Prediction:
        """
        Extract complete knowledge graph from text.

        Args:
            text: Source text
            context: Optional context

        Returns:
            Prediction with entities and relations
        """
        # First extract entities
        entity_result = self.entity_extractor(text=text, context=context)

        # Then extract relations using entities
        relation_result = self.relation_extractor(
            text=text,
            entities=entity_result.parsed_entities
        )

        # Filter to valid relations
        valid_relations = [r for r in relation_result.parsed_relations if r.get('valid', True)]

        return dspy.Prediction(
            entities=entity_result.entities,
            relations=relation_result.relations,
            parsed_entities=entity_result.parsed_entities,
            parsed_relations=valid_relations,
            all_relations=relation_result.parsed_relations,
            entity_count=len(entity_result.parsed_entities),
            relation_count=len(valid_relations),
            invalid_relation_count=len(relation_result.parsed_relations) - len(valid_relations)
        )


# ═══════════════════════════════════════════════════════════════════════════════
# FACTORY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def create_relation_extractor(
    mode: str = "standard",
    relation_types: Optional[Dict] = None
) -> RelationExtractor:
    """
    Create relation extractor with specified mode.

    Args:
        mode: "standard", "cot" (chain of thought), "fast"
        relation_types: Custom relation schema

    Returns:
        Configured RelationExtractor
    """
    if mode == "cot":
        return RelationExtractor(use_cot=True, use_constraints=True, relation_types=relation_types)
    elif mode == "fast":
        return RelationExtractor(use_cot=False, use_constraints=False)
    else:
        return RelationExtractor(use_cot=False, use_constraints=True, relation_types=relation_types)


def create_kg_extractor(use_cot: bool = False) -> KnowledgeGraphExtractor:
    """Create combined entity + relation extractor."""
    return KnowledgeGraphExtractor(use_cot=use_cot)
