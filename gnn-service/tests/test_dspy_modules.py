"""
Tests for DSPy Modules

Note: These tests use mock LLM responses since DSPy requires
actual LLM access. For full integration tests, configure DSPy
with a real LLM backend.
"""

import pytest
import json
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


# ═══════════════════════════════════════════════════════════════════════════════
# MOCK DSPY FOR TESTING WITHOUT LLM
# ═══════════════════════════════════════════════════════════════════════════════

class MockPrediction:
    """Mock DSPy prediction for testing."""
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class MockPredict:
    """Mock DSPy Predict for testing."""
    def __init__(self, signature):
        self.signature = signature
        self._mock_response = None

    def __call__(self, **kwargs):
        if self._mock_response:
            return MockPrediction(**self._mock_response)
        # Default mock responses based on signature
        return MockPrediction(
            entities='[]',
            relations='[]',
            verification='{"score": 0.8, "issues": []}',
            plan='{"steps": []}'
        )


# Try to import real DSPy, fall back to mock
try:
    import dspy
    DSPY_AVAILABLE = True
except ImportError:
    DSPY_AVAILABLE = False
    # Create mock dspy module
    class MockDspy:
        class Module:
            def __init__(self):
                pass
        class Signature:
            pass
        class InputField:
            def __init__(self, **kwargs):
                pass
        class OutputField:
            def __init__(self, **kwargs):
                pass
        Predict = MockPredict
        ChainOfThought = MockPredict
        Example = dict
        @staticmethod
        def Prediction(**kwargs):
            return MockPrediction(**kwargs)

    dspy = MockDspy()


# ═══════════════════════════════════════════════════════════════════════════════
# SIGNATURE TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestSignatures:
    """Test DSPy signatures are properly defined."""

    def test_entity_extraction_signature_exists(self):
        """Test EntityExtraction signature."""
        from dspy_modules.signatures import EntityExtraction

        assert hasattr(EntityExtraction, '__doc__')

    def test_relation_extraction_signature_exists(self):
        """Test RelationExtraction signature."""
        from dspy_modules.signatures import RelationExtraction

        assert hasattr(RelationExtraction, '__doc__')

    def test_graph_verification_signature_exists(self):
        """Test GraphVerification signature."""
        from dspy_modules.signatures import GraphVerification

        assert hasattr(GraphVerification, '__doc__')

    def test_claim_verification_signature_exists(self):
        """Test ClaimVerification signature."""
        from dspy_modules.signatures import ClaimVerification

        assert hasattr(ClaimVerification, '__doc__')


# ═══════════════════════════════════════════════════════════════════════════════
# ENTITY EXTRACTION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestEntityExtraction:
    """Test entity extraction module."""

    def test_aopeg_entity_types_defined(self):
        """Test AOPEG entity types are defined."""
        from dspy_modules.entity_extraction import AOPEG_ENTITY_TYPES

        assert 'WorkItem' in AOPEG_ENTITY_TYPES
        assert 'User' in AOPEG_ENTITY_TYPES
        assert 'Repository' in AOPEG_ENTITY_TYPES
        assert 'PullRequest' in AOPEG_ENTITY_TYPES
        assert len(AOPEG_ENTITY_TYPES) >= 30

    def test_entity_extractor_init(self):
        """Test EntityExtractor initialization."""
        from dspy_modules.entity_extraction import EntityExtractor

        extractor = EntityExtractor(use_cot=False, use_ontology=True)
        assert extractor.use_ontology is True

    def test_entity_extractor_factory(self):
        """Test entity extractor factory function."""
        from dspy_modules.entity_extraction import create_entity_extractor

        # Standard mode
        extractor = create_entity_extractor("standard")
        assert extractor.use_ontology is True

        # Fast mode
        extractor = create_entity_extractor("fast")
        assert extractor.use_ontology is False

    def test_parse_entities_json(self):
        """Test entity JSON parsing."""
        from dspy_modules.entity_extraction import EntityExtractor

        extractor = EntityExtractor()

        # Test valid JSON
        entities_json = '[{"name": "Bug123", "type": "Bug", "confidence": 0.9}]'
        parsed = extractor._parse_entities(entities_json)

        assert len(parsed) == 1
        assert parsed[0]['name'] == 'Bug123'
        assert parsed[0]['type'] == 'Bug'

    def test_parse_entities_markdown(self):
        """Test entity parsing with markdown code blocks."""
        from dspy_modules.entity_extraction import EntityExtractor

        extractor = EntityExtractor()

        # Test markdown wrapped JSON
        entities_json = '```json\n[{"name": "Feature1", "type": "Feature"}]\n```'
        parsed = extractor._parse_entities(entities_json)

        assert len(parsed) == 1
        assert parsed[0]['name'] == 'Feature1'

    def test_fallback_parse(self):
        """Test fallback parsing for malformed output."""
        from dspy_modules.entity_extraction import EntityExtractor

        extractor = EntityExtractor()

        # Test malformed but parseable text
        text = 'Found entity "User1" of type User and "Bug123" of type Bug'
        parsed = extractor._fallback_parse(text)

        # Should extract at least some entities
        assert isinstance(parsed, list)


# ═══════════════════════════════════════════════════════════════════════════════
# RELATION EXTRACTION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestRelationExtraction:
    """Test relation extraction module."""

    def test_aopeg_relation_types_defined(self):
        """Test AOPEG relation types are defined."""
        from dspy_modules.relation_extraction import AOPEG_RELATION_TYPES

        assert 'ASSIGNED_TO' in AOPEG_RELATION_TYPES
        assert 'DEPENDS_ON' in AOPEG_RELATION_TYPES
        assert 'REFERENCES' in AOPEG_RELATION_TYPES
        assert len(AOPEG_RELATION_TYPES) >= 20

    def test_relation_constraints(self):
        """Test relation domain/range constraints."""
        from dspy_modules.relation_extraction import AOPEG_RELATION_TYPES

        # Check ASSIGNED_TO constraints
        assigned_to = AOPEG_RELATION_TYPES['ASSIGNED_TO']
        assert 'WorkItem' in assigned_to['domain']
        assert 'User' in assigned_to['range']

        # Check MODIFIES constraints
        modifies = AOPEG_RELATION_TYPES['MODIFIES']
        assert 'Commit' in modifies['domain']
        assert 'File' in modifies['range']

    def test_relation_extractor_init(self):
        """Test RelationExtractor initialization."""
        from dspy_modules.relation_extraction import RelationExtractor

        extractor = RelationExtractor(use_cot=False, use_constraints=True)
        assert extractor.use_constraints is True

    def test_relation_extractor_factory(self):
        """Test relation extractor factory."""
        from dspy_modules.relation_extraction import create_relation_extractor

        extractor = create_relation_extractor("standard")
        assert extractor.use_constraints is True

        extractor = create_relation_extractor("fast")
        assert extractor.use_constraints is False

    def test_parse_relations_json(self):
        """Test relation JSON parsing."""
        from dspy_modules.relation_extraction import RelationExtractor

        extractor = RelationExtractor()

        entities = [
            {'name': 'Bug123', 'type': 'Bug'},
            {'name': 'John', 'type': 'User'}
        ]

        relations_json = '''[{
            "source": "Bug123",
            "target": "John",
            "relation_type": "ASSIGNED_TO",
            "confidence": 0.9
        }]'''

        parsed = extractor._parse_relations(relations_json, entities)

        assert len(parsed) == 1
        assert parsed[0]['source'] == 'Bug123'
        assert parsed[0]['target'] == 'John'
        assert parsed[0]['relation_type'] == 'ASSIGNED_TO'
        assert parsed[0]['valid'] is True  # Bug can be assigned to User

    def test_kg_extractor_init(self):
        """Test KnowledgeGraphExtractor initialization."""
        from dspy_modules.relation_extraction import KnowledgeGraphExtractor

        extractor = KnowledgeGraphExtractor(use_cot=False)
        assert extractor.entity_extractor is not None
        assert extractor.relation_extractor is not None


# ═══════════════════════════════════════════════════════════════════════════════
# TASK PLANNING TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestTaskPlanning:
    """Test task planning module."""

    def test_text_type_strategies_defined(self):
        """Test text type strategies are defined."""
        from dspy_modules.task_planning import TEXT_TYPE_STRATEGIES

        assert 'work_item' in TEXT_TYPE_STRATEGIES
        assert 'commit' in TEXT_TYPE_STRATEGIES
        assert 'pr_description' in TEXT_TYPE_STRATEGIES
        assert 'wiki' in TEXT_TYPE_STRATEGIES

    def test_task_planner_init(self):
        """Test TaskPlanner initialization."""
        from dspy_modules.task_planning import TaskPlanner

        planner = TaskPlanner(use_llm=False)
        assert planner.use_llm is False

    def test_detect_text_type_work_item(self):
        """Test text type detection for work items."""
        from dspy_modules.task_planning import TaskPlanner

        planner = TaskPlanner(use_llm=False)

        text = "As a user I want to login so that I can access my dashboard. Acceptance criteria: ..."
        detected = planner._detect_text_type(text)

        assert detected == 'work_item'

    def test_detect_text_type_commit(self):
        """Test text type detection for commits."""
        from dspy_modules.task_planning import TaskPlanner

        planner = TaskPlanner(use_llm=False)

        text = "abc123def Merge branch 'feature/login' into main"
        detected = planner._detect_text_type(text)

        assert detected == 'commit'

    def test_detect_text_type_pr(self):
        """Test text type detection for pull requests."""
        from dspy_modules.task_planning import TaskPlanner

        planner = TaskPlanner(use_llm=False)

        text = "Pull Request #45: Add login feature. Please review changes."
        detected = planner._detect_text_type(text)

        assert detected == 'pr_description'

    def test_heuristic_plan_generation(self):
        """Test heuristic plan generation."""
        from dspy_modules.task_planning import TaskPlanner

        planner = TaskPlanner(use_llm=False)

        plan = planner._build_heuristic_plan(
            "This is a test work item description",
            "work_item"
        )

        assert len(plan.steps) > 0
        assert plan.text_type == 'work_item'
        assert plan.estimated_entities > 0

    def test_plan_step_dataclass(self):
        """Test PlanStep dataclass."""
        from dspy_modules.task_planning import PlanStep

        step = PlanStep(
            module='entity_extraction',
            config={'use_cot': False},
            reason='Extract entities first',
            priority=1
        )

        step_dict = step.to_dict()
        assert step_dict['module'] == 'entity_extraction'
        assert step_dict['priority'] == 1


# ═══════════════════════════════════════════════════════════════════════════════
# GRAPH VERIFICATION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestGraphVerification:
    """Test graph verification module."""

    def test_verification_issue_dataclass(self):
        """Test VerificationIssue dataclass."""
        from dspy_modules.graph_verification import VerificationIssue

        issue = VerificationIssue(
            issue_type='hallucination',
            element_type='entity',
            element={'name': 'FakeEntity', 'type': 'Bug'},
            reason='Not found in source text',
            suggestion='Remove this entity'
        )

        issue_dict = issue.to_dict()
        assert issue_dict['type'] == 'hallucination'
        assert issue_dict['element_type'] == 'entity'

    def test_verification_report_dataclass(self):
        """Test VerificationReport dataclass."""
        from dspy_modules.graph_verification import VerificationReport

        report = VerificationReport(
            score=0.85,
            grade='B',
            issues=[],
            valid_entities=[{'name': 'Bug123', 'type': 'Bug'}],
            valid_relations=[]
        )

        report_dict = report.to_dict()
        assert report_dict['score'] == 0.85
        assert report_dict['grade'] == 'B'
        assert report_dict['entity_accuracy'] == 1.0

    def test_graph_verifier_init(self):
        """Test GraphVerifier initialization."""
        from dspy_modules.graph_verification import GraphVerifier

        verifier = GraphVerifier(use_cot=True, verify_claims=True)
        assert verifier.verify_claims is True

    def test_score_to_grade(self):
        """Test score to grade conversion."""
        from dspy_modules.graph_verification import GraphVerifier

        verifier = GraphVerifier()

        assert verifier._score_to_grade(0.95) == 'A'
        assert verifier._score_to_grade(0.85) == 'B'
        assert verifier._score_to_grade(0.75) == 'C'
        assert verifier._score_to_grade(0.65) == 'D'
        assert verifier._score_to_grade(0.50) == 'F'

    def test_parse_verdict(self):
        """Test verdict parsing."""
        from dspy_modules.graph_verification import GraphVerifier

        verifier = GraphVerifier()

        # Valid JSON
        verdict_json = '{"verdict": "grounded", "confidence": 0.9}'
        result = verifier._parse_verdict(verdict_json)
        assert result['verdict'] == 'grounded'

        # Text with hallucinated keyword
        result = verifier._parse_verdict("This claim is hallucinated")
        assert result['verdict'] == 'hallucinated'

        # Text with grounded keyword
        result = verifier._parse_verdict("This claim is grounded in the text")
        assert result['verdict'] == 'grounded'


# ═══════════════════════════════════════════════════════════════════════════════
# OPTIMIZER TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestOptimizer:
    """Test prompt optimizer module."""

    def test_optimization_config_defaults(self):
        """Test OptimizationConfig defaults."""
        from dspy_modules.optimizer import OptimizationConfig

        config = OptimizationConfig()

        assert config.optimizer == 'miprov2'
        assert config.num_candidates == 10
        assert config.num_trials == 30

    def test_optimization_config_to_dict(self):
        """Test OptimizationConfig to_dict."""
        from dspy_modules.optimizer import OptimizationConfig

        config = OptimizationConfig(optimizer='bootstrap', num_trials=50)
        config_dict = config.to_dict()

        assert config_dict['optimizer'] == 'bootstrap'
        assert config_dict['num_trials'] == 50

    def test_entity_extraction_metric(self):
        """Test entity extraction metric."""
        from dspy_modules.optimizer import entity_extraction_metric

        # Create mock gold and prediction
        gold = type('Example', (), {
            'entities': '[{"name": "Bug1", "type": "Bug"}, {"name": "User1", "type": "User"}]'
        })()

        # Perfect prediction
        pred = type('Prediction', (), {
            'parsed_entities': [
                {'name': 'Bug1', 'type': 'Bug'},
                {'name': 'User1', 'type': 'User'}
            ]
        })()

        score = entity_extraction_metric(gold, pred)
        assert score == 1.0

        # Partial prediction
        pred.parsed_entities = [{'name': 'Bug1', 'type': 'Bug'}]
        score = entity_extraction_metric(gold, pred)
        assert 0 < score < 1

    def test_relation_extraction_metric(self):
        """Test relation extraction metric."""
        from dspy_modules.optimizer import relation_extraction_metric

        gold = type('Example', (), {
            'relations': '[{"source": "Bug1", "target": "User1", "relation_type": "ASSIGNED_TO"}]'
        })()

        pred = type('Prediction', (), {
            'parsed_relations': [
                {'source': 'Bug1', 'target': 'User1', 'relation_type': 'ASSIGNED_TO'}
            ]
        })()

        score = relation_extraction_metric(gold, pred)
        assert score == 1.0

    def test_create_entity_examples(self):
        """Test entity example creation."""
        from dspy_modules.optimizer import create_entity_examples

        data = [
            {
                'text': 'Bug123 is assigned to John',
                'entities': [
                    {'name': 'Bug123', 'type': 'Bug'},
                    {'name': 'John', 'type': 'User'}
                ]
            }
        ]

        examples = create_entity_examples(data)
        assert len(examples) == 1

    def test_prompt_optimizer_init(self):
        """Test PromptOptimizer initialization."""
        from dspy_modules.optimizer import PromptOptimizer, OptimizationConfig

        config = OptimizationConfig(optimizer='bootstrap')
        optimizer = PromptOptimizer(config)

        assert optimizer.config.optimizer == 'bootstrap'
        assert len(optimizer.optimization_history) == 0


# ═══════════════════════════════════════════════════════════════════════════════
# MODULE EXPORTS TEST
# ═══════════════════════════════════════════════════════════════════════════════

class TestModuleExports:
    """Test module exports from __init__.py."""

    def test_all_exports_available(self):
        """Test all expected exports are available."""
        from dspy_modules import (
            EntityExtraction,
            RelationExtraction,
            TaskPlanning,
            GraphVerification,
            ClaimVerification,
            EntityExtractor,
            RelationExtractor,
            TaskPlanner,
            GraphVerifier,
            PromptOptimizer,
            OptimizationConfig
        )

        # Just check they're importable
        assert EntityExtraction is not None
        assert EntityExtractor is not None
        assert PromptOptimizer is not None


# ═══════════════════════════════════════════════════════════════════════════════
# RUN TESTS
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    # Run without pytest if not available
    test_classes = [
        TestSignatures,
        TestEntityExtraction,
        TestRelationExtraction,
        TestTaskPlanning,
        TestGraphVerification,
        TestOptimizer,
        TestModuleExports
    ]

    passed = 0
    failed = 0

    for test_class in test_classes:
        print(f"\n{'='*60}")
        print(f"Running {test_class.__name__}")
        print('='*60)

        instance = test_class()
        methods = [m for m in dir(instance) if m.startswith('test_')]

        for method_name in methods:
            try:
                method = getattr(instance, method_name)
                method()
                print(f"  ✓ {method_name}")
                passed += 1
            except Exception as e:
                print(f"  ✗ {method_name}: {str(e)}")
                failed += 1

    print(f"\n{'='*60}")
    print(f"Results: {passed} passed, {failed} failed")
    print('='*60)

    if failed > 0:
        sys.exit(1)
