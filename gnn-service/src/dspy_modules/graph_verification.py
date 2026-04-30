"""
DSPy Graph Verification Module

Verifies extracted knowledge graphs against source text.
Implements PiVe-style verification: Generate → Verify → Correct.
"""

import dspy
import json
import re
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field

from .signatures import (
    GraphVerification,
    ClaimVerification,
    OntologyValidation,
    EntityCorrection,
    RelationCorrection
)


# ═══════════════════════════════════════════════════════════════════════════════
# DATA CLASSES
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class VerificationIssue:
    """Single verification issue."""
    issue_type: str  # 'hallucination', 'inconsistency', 'missing', 'invalid_type'
    element_type: str  # 'entity' or 'relation'
    element: Dict[str, Any]
    reason: str
    suggestion: str
    confidence: float = 0.8

    def to_dict(self) -> Dict:
        return {
            'type': self.issue_type,
            'element_type': self.element_type,
            'element': self.element,
            'reason': self.reason,
            'suggestion': self.suggestion,
            'confidence': self.confidence
        }


@dataclass
class VerificationReport:
    """Complete verification report."""
    score: float
    grade: str
    issues: List[VerificationIssue]
    valid_entities: List[Dict]
    valid_relations: List[Dict]
    hallucinated_entities: List[Dict] = field(default_factory=list)
    hallucinated_relations: List[Dict] = field(default_factory=list)
    corrections_applied: int = 0

    def to_dict(self) -> Dict:
        return {
            'score': self.score,
            'grade': self.grade,
            'issue_count': len(self.issues),
            'issues': [i.to_dict() for i in self.issues],
            'valid_entities': self.valid_entities,
            'valid_relations': self.valid_relations,
            'hallucinated_entities': self.hallucinated_entities,
            'hallucinated_relations': self.hallucinated_relations,
            'corrections_applied': self.corrections_applied,
            'entity_accuracy': len(self.valid_entities) / max(1, len(self.valid_entities) + len(self.hallucinated_entities)),
            'relation_accuracy': len(self.valid_relations) / max(1, len(self.valid_relations) + len(self.hallucinated_relations))
        }


# ═══════════════════════════════════════════════════════════════════════════════
# GRAPH VERIFIER MODULE
# ═══════════════════════════════════════════════════════════════════════════════

class GraphVerifier(dspy.Module):
    """DSPy module for verifying extracted knowledge graphs."""

    def __init__(
        self,
        use_cot: bool = True,
        verify_claims: bool = True,
        max_issues: int = 50
    ):
        """
        Initialize graph verifier.

        Args:
            use_cot: Use Chain-of-Thought for verification
            verify_claims: Verify individual claims
            max_issues: Maximum issues to report
        """
        super().__init__()

        self.verify_claims = verify_claims
        self.max_issues = max_issues

        if use_cot:
            self.verifier = dspy.ChainOfThought(GraphVerification)
            self.claim_verifier = dspy.ChainOfThought(ClaimVerification)
        else:
            self.verifier = dspy.Predict(GraphVerification)
            self.claim_verifier = dspy.Predict(ClaimVerification)

    def forward(
        self,
        entities: List[Dict],
        relations: List[Dict],
        source_text: str
    ) -> dspy.Prediction:
        """
        Verify extracted graph against source text.

        Args:
            entities: Extracted entities
            relations: Extracted relations
            source_text: Original source text

        Returns:
            Prediction with VerificationReport
        """
        if not entities and not relations:
            return dspy.Prediction(
                report=VerificationReport(
                    score=1.0,
                    grade='A',
                    issues=[],
                    valid_entities=[],
                    valid_relations=[]
                ),
                report_json=json.dumps({'score': 1.0, 'grade': 'A', 'issues': []})
            )

        # Full graph verification
        result = self.verifier(
            entities=json.dumps(entities),
            relations=json.dumps(relations),
            source_text=source_text[:4000]  # Truncate for context
        )

        # Parse verification result
        report = self._parse_verification(result.verification, entities, relations)

        # Optional: verify individual claims
        if self.verify_claims and len(entities) + len(relations) <= 20:
            report = self._verify_individual_claims(report, source_text)

        return dspy.Prediction(
            report=report,
            report_json=json.dumps(report.to_dict()),
            score=report.score,
            grade=report.grade,
            issue_count=len(report.issues)
        )

    def _parse_verification(
        self,
        verification_json: str,
        entities: List[Dict],
        relations: List[Dict]
    ) -> VerificationReport:
        """Parse LLM verification output."""
        try:
            # Handle markdown code blocks
            if "```json" in verification_json:
                match = re.search(r'```json\s*(.*?)\s*```', verification_json, re.DOTALL)
                if match:
                    verification_json = match.group(1)

            data = json.loads(verification_json)

            issues = []
            for issue_data in data.get('issues', [])[:self.max_issues]:
                issues.append(VerificationIssue(
                    issue_type=issue_data.get('type', 'unknown'),
                    element_type=issue_data.get('element_type', 'entity'),
                    element=issue_data.get('element', {}),
                    reason=issue_data.get('reason', ''),
                    suggestion=issue_data.get('suggestion', ''),
                    confidence=issue_data.get('confidence', 0.8)
                ))

            # Separate valid vs hallucinated
            valid_entities = data.get('valid_entities', entities)
            valid_relations = data.get('valid_relations', relations)

            hallucinated_entities = [e for e in entities if e not in valid_entities]
            hallucinated_relations = [r for r in relations if r not in valid_relations]

            score = data.get('score', self._calculate_score(issues, entities, relations))
            grade = self._score_to_grade(score)

            return VerificationReport(
                score=score,
                grade=grade,
                issues=issues,
                valid_entities=valid_entities,
                valid_relations=valid_relations,
                hallucinated_entities=hallucinated_entities,
                hallucinated_relations=hallucinated_relations
            )

        except (json.JSONDecodeError, KeyError, TypeError):
            # Fallback: assume all valid
            return VerificationReport(
                score=0.7,
                grade='C',
                issues=[VerificationIssue(
                    issue_type='parse_error',
                    element_type='graph',
                    element={},
                    reason='Could not parse verification result',
                    suggestion='Manual review recommended'
                )],
                valid_entities=entities,
                valid_relations=relations
            )

    def _verify_individual_claims(
        self,
        report: VerificationReport,
        source_text: str
    ) -> VerificationReport:
        """Verify individual entity/relation claims."""
        new_issues = list(report.issues)
        hallucinated_entities = []
        hallucinated_relations = []

        # Verify entities
        for entity in report.valid_entities[:10]:  # Limit for efficiency
            claim = f"Entity '{entity.get('name')}' of type {entity.get('type')} exists in the text"
            result = self.claim_verifier(claim=claim, evidence=source_text[:2000])

            verdict_data = self._parse_verdict(result.verdict)

            if verdict_data.get('verdict') == 'hallucinated':
                hallucinated_entities.append(entity)
                new_issues.append(VerificationIssue(
                    issue_type='hallucination',
                    element_type='entity',
                    element=entity,
                    reason=verdict_data.get('reasoning', 'Not grounded in text'),
                    suggestion='Remove this entity',
                    confidence=verdict_data.get('confidence', 0.8)
                ))

        # Verify relations
        for relation in report.valid_relations[:10]:
            claim = f"Relation {relation.get('source')} -{relation.get('relation_type')}-> {relation.get('target')}"
            result = self.claim_verifier(claim=claim, evidence=source_text[:2000])

            verdict_data = self._parse_verdict(result.verdict)

            if verdict_data.get('verdict') == 'hallucinated':
                hallucinated_relations.append(relation)
                new_issues.append(VerificationIssue(
                    issue_type='hallucination',
                    element_type='relation',
                    element=relation,
                    reason=verdict_data.get('reasoning', 'Not grounded in text'),
                    suggestion='Remove this relation',
                    confidence=verdict_data.get('confidence', 0.8)
                ))

        # Update report
        valid_entities = [e for e in report.valid_entities if e not in hallucinated_entities]
        valid_relations = [r for r in report.valid_relations if r not in hallucinated_relations]

        # Recalculate score
        total = len(report.valid_entities) + len(report.valid_relations)
        hallucinated = len(hallucinated_entities) + len(hallucinated_relations)
        new_score = (total - hallucinated) / max(1, total)

        return VerificationReport(
            score=new_score,
            grade=self._score_to_grade(new_score),
            issues=new_issues[:self.max_issues],
            valid_entities=valid_entities,
            valid_relations=valid_relations,
            hallucinated_entities=report.hallucinated_entities + hallucinated_entities,
            hallucinated_relations=report.hallucinated_relations + hallucinated_relations
        )

    def _parse_verdict(self, verdict_json: str) -> Dict:
        """Parse claim verification verdict."""
        try:
            if "```json" in verdict_json:
                match = re.search(r'```json\s*(.*?)\s*```', verdict_json, re.DOTALL)
                if match:
                    verdict_json = match.group(1)

            return json.loads(verdict_json)

        except json.JSONDecodeError:
            # Try to extract verdict from text
            verdict_lower = verdict_json.lower()
            if 'hallucinated' in verdict_lower or 'not found' in verdict_lower:
                return {'verdict': 'hallucinated', 'confidence': 0.7}
            elif 'grounded' in verdict_lower or 'found' in verdict_lower:
                return {'verdict': 'grounded', 'confidence': 0.8}
            else:
                return {'verdict': 'uncertain', 'confidence': 0.5}

    def _calculate_score(
        self,
        issues: List[VerificationIssue],
        entities: List[Dict],
        relations: List[Dict]
    ) -> float:
        """Calculate verification score from issues."""
        total = len(entities) + len(relations)
        if total == 0:
            return 1.0

        # Count hallucinations and errors
        hallucinations = sum(1 for i in issues if i.issue_type == 'hallucination')
        errors = sum(1 for i in issues if i.issue_type in ['invalid_type', 'inconsistency'])

        penalty = (hallucinations * 0.15) + (errors * 0.1)
        return max(0, 1.0 - penalty)

    def _score_to_grade(self, score: float) -> str:
        """Convert score to letter grade."""
        if score >= 0.9:
            return 'A'
        elif score >= 0.8:
            return 'B'
        elif score >= 0.7:
            return 'C'
        elif score >= 0.6:
            return 'D'
        else:
            return 'F'


# ═══════════════════════════════════════════════════════════════════════════════
# ITERATIVE CORRECTOR MODULE
# ═══════════════════════════════════════════════════════════════════════════════

class IterativeCorrector(dspy.Module):
    """Iteratively correct extraction based on verification feedback."""

    def __init__(self, max_iterations: int = 3):
        super().__init__()
        self.max_iterations = max_iterations
        self.verifier = GraphVerifier()
        self.entity_corrector = dspy.Predict(EntityCorrection)
        self.relation_corrector = dspy.Predict(RelationCorrection)

    def forward(
        self,
        entities: List[Dict],
        relations: List[Dict],
        source_text: str,
        target_score: float = 0.85
    ) -> dspy.Prediction:
        """
        Iteratively verify and correct extraction.

        Args:
            entities: Initial extracted entities
            relations: Initial extracted relations
            source_text: Original source text
            target_score: Target verification score

        Returns:
            Prediction with corrected graph
        """
        current_entities = entities
        current_relations = relations
        iterations = []

        for i in range(self.max_iterations):
            # Verify current state
            verification = self.verifier(
                entities=current_entities,
                relations=current_relations,
                source_text=source_text
            )

            iterations.append({
                'iteration': i + 1,
                'score': verification.score,
                'issue_count': verification.issue_count
            })

            # Check if target reached
            if verification.score >= target_score:
                break

            # No issues to fix
            if verification.issue_count == 0:
                break

            # Apply corrections
            entity_issues = [issue for issue in verification.report.issues
                          if issue.element_type == 'entity']
            relation_issues = [issue for issue in verification.report.issues
                            if issue.element_type == 'relation']

            if entity_issues:
                corrected = self.entity_corrector(
                    entities=json.dumps(current_entities),
                    issues=json.dumps([i.to_dict() for i in entity_issues]),
                    source_text=source_text[:2000]
                )
                current_entities = self._parse_corrected(corrected.corrected_entities, current_entities)

            if relation_issues:
                corrected = self.relation_corrector(
                    relations=json.dumps(current_relations),
                    issues=json.dumps([i.to_dict() for i in relation_issues]),
                    entities=json.dumps(current_entities),
                    source_text=source_text[:2000]
                )
                current_relations = self._parse_corrected(corrected.corrected_relations, current_relations)

        # Final verification
        final_verification = self.verifier(
            entities=current_entities,
            relations=current_relations,
            source_text=source_text
        )

        return dspy.Prediction(
            entities=current_entities,
            relations=current_relations,
            initial_entities=entities,
            initial_relations=relations,
            final_score=final_verification.score,
            final_grade=final_verification.grade,
            iterations=iterations,
            improvement=final_verification.score - (iterations[0]['score'] if iterations else 0),
            report=final_verification.report
        )

    def _parse_corrected(self, corrected_json: str, fallback: List[Dict]) -> List[Dict]:
        """Parse corrected output."""
        try:
            if "```json" in corrected_json:
                match = re.search(r'```json\s*(.*?)\s*```', corrected_json, re.DOTALL)
                if match:
                    corrected_json = match.group(1)

            result = json.loads(corrected_json)
            return result if isinstance(result, list) else fallback

        except json.JSONDecodeError:
            return fallback


# ═══════════════════════════════════════════════════════════════════════════════
# FACTORY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def create_graph_verifier(
    use_cot: bool = True,
    verify_claims: bool = True
) -> GraphVerifier:
    """Create graph verifier."""
    return GraphVerifier(use_cot=use_cot, verify_claims=verify_claims)


def create_iterative_corrector(max_iterations: int = 3) -> IterativeCorrector:
    """Create iterative corrector."""
    return IterativeCorrector(max_iterations=max_iterations)
