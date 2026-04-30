"""
DSPy Task Planning Module

Plans extraction pipeline execution using LLM-optimized prompts.
Analyzes text characteristics to select optimal processing strategy.
"""

import dspy
import json
import re
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from .signatures import TaskPlanning, TaskDecomposition


# ═══════════════════════════════════════════════════════════════════════════════
# AVAILABLE EXTRACTORS AND STRATEGIES
# ═══════════════════════════════════════════════════════════════════════════════

AVAILABLE_EXTRACTORS = [
    'entity_extraction',
    'entity_extraction_cot',
    'relation_extraction',
    'relation_extraction_cot',
    'kg_extraction',
    'hallucination_check',
    'ontology_validation',
    'duplicate_detection',
    'coreference_resolution'
]

TEXT_TYPE_STRATEGIES = {
    'work_item': {
        'extractors': ['entity_extraction', 'relation_extraction', 'ontology_validation'],
        'config': {'use_cot': False, 'validate': True}
    },
    'commit': {
        'extractors': ['entity_extraction', 'relation_extraction'],
        'config': {'use_cot': False, 'focus': ['File', 'WorkItem', 'User']}
    },
    'pr_description': {
        'extractors': ['entity_extraction_cot', 'relation_extraction_cot', 'hallucination_check'],
        'config': {'use_cot': True, 'verify': True}
    },
    'comment': {
        'extractors': ['entity_extraction', 'coreference_resolution'],
        'config': {'use_cot': False, 'resolve_mentions': True}
    },
    'wiki': {
        'extractors': ['kg_extraction', 'hallucination_check', 'duplicate_detection'],
        'config': {'use_cot': True, 'chunk_large': True}
    },
    'code_review': {
        'extractors': ['entity_extraction', 'relation_extraction'],
        'config': {'focus': ['File', 'User', 'CodeReview']}
    },
    'test_result': {
        'extractors': ['entity_extraction', 'relation_extraction'],
        'config': {'focus': ['TestCase', 'TestResult', 'Bug']}
    }
}


# ═══════════════════════════════════════════════════════════════════════════════
# DATA CLASSES
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class PlanStep:
    """Single step in extraction plan."""
    module: str
    config: Dict[str, Any]
    reason: str
    priority: int = 0
    dependencies: List[str] = None

    def __post_init__(self):
        if self.dependencies is None:
            self.dependencies = []

    def to_dict(self) -> Dict:
        return {
            'module': self.module,
            'config': self.config,
            'reason': self.reason,
            'priority': self.priority,
            'dependencies': self.dependencies
        }


@dataclass
class ExtractionPlan:
    """Complete extraction plan."""
    steps: List[PlanStep]
    estimated_entities: int
    estimated_relations: int
    text_type: str
    complexity: str  # 'simple', 'moderate', 'complex'
    chunking_needed: bool = False
    chunk_size: int = 0

    def to_dict(self) -> Dict:
        return {
            'steps': [s.to_dict() for s in self.steps],
            'estimated_entities': self.estimated_entities,
            'estimated_relations': self.estimated_relations,
            'text_type': self.text_type,
            'complexity': self.complexity,
            'chunking_needed': self.chunking_needed,
            'chunk_size': self.chunk_size
        }


# ═══════════════════════════════════════════════════════════════════════════════
# TASK PLANNER MODULE
# ═══════════════════════════════════════════════════════════════════════════════

class TaskPlanner(dspy.Module):
    """DSPy module for planning extraction pipelines."""

    def __init__(
        self,
        use_llm: bool = True,
        available_extractors: Optional[List[str]] = None
    ):
        """
        Initialize task planner.

        Args:
            use_llm: Use LLM for planning (vs heuristic fallback)
            available_extractors: Custom list of available extractors
        """
        super().__init__()

        self.use_llm = use_llm
        self.available_extractors = available_extractors or AVAILABLE_EXTRACTORS

        if use_llm:
            self.planner = dspy.Predict(TaskPlanning)
            self.decomposer = dspy.Predict(TaskDecomposition)

    def forward(
        self,
        text: str,
        text_type: str = "auto",
        force_strategy: Optional[str] = None
    ) -> dspy.Prediction:
        """
        Create extraction plan for text.

        Args:
            text: Input text to plan extraction for
            text_type: Type of text or "auto" for detection
            force_strategy: Override with specific strategy

        Returns:
            Prediction with ExtractionPlan
        """
        # Detect text type if auto
        if text_type == "auto":
            text_type = self._detect_text_type(text)

        # Check if chunking needed
        text_size = len(text)
        chunking_needed = text_size > 4000

        # Use forced strategy or LLM planning
        if force_strategy and force_strategy in TEXT_TYPE_STRATEGIES:
            plan = self._build_heuristic_plan(text, force_strategy)
        elif self.use_llm and text_size > 100:
            plan = self._build_llm_plan(text, text_type)
        else:
            plan = self._build_heuristic_plan(text, text_type)

        plan.chunking_needed = chunking_needed
        if chunking_needed:
            plan.chunk_size = 2000

        return dspy.Prediction(
            plan=plan,
            plan_json=json.dumps(plan.to_dict()),
            text_type=text_type,
            complexity=plan.complexity
        )

    def _detect_text_type(self, text: str) -> str:
        """Detect text type from content patterns."""
        text_lower = text.lower()

        # Check for work item patterns
        if any(kw in text_lower for kw in ['acceptance criteria', 'as a user', 'story points', 'sprint']):
            return 'work_item'

        # Check for commit patterns
        if any(kw in text_lower for kw in ['commit', 'merge', 'branch', 'cherry-pick']) or re.search(r'^[a-f0-9]{7,40}\s', text):
            return 'commit'

        # Check for PR patterns
        if any(kw in text_lower for kw in ['pull request', 'pr #', 'merge request', 'review changes']):
            return 'pr_description'

        # Check for test patterns
        if any(kw in text_lower for kw in ['test result', 'passed', 'failed', 'test case', 'assertion']):
            return 'test_result'

        # Check for wiki/doc patterns
        if any(kw in text_lower for kw in ['# ', '## ', '### ', '```', 'documentation']):
            return 'wiki'

        # Check for code review
        if any(kw in text_lower for kw in ['code review', 'lgtm', 'nit:', 'suggestion:']):
            return 'code_review'

        # Default to work_item
        return 'work_item'

    def _build_heuristic_plan(self, text: str, text_type: str) -> ExtractionPlan:
        """Build plan using heuristic strategies."""
        strategy = TEXT_TYPE_STRATEGIES.get(text_type, TEXT_TYPE_STRATEGIES['work_item'])

        steps = []
        for i, extractor in enumerate(strategy['extractors']):
            steps.append(PlanStep(
                module=extractor,
                config=strategy.get('config', {}),
                reason=f"Standard {text_type} extraction step",
                priority=i,
                dependencies=[strategy['extractors'][i-1]] if i > 0 and 'extraction' in extractor else []
            ))

        # Estimate based on text length
        word_count = len(text.split())
        complexity = 'simple' if word_count < 100 else 'moderate' if word_count < 500 else 'complex'

        return ExtractionPlan(
            steps=steps,
            estimated_entities=max(1, word_count // 20),
            estimated_relations=max(1, word_count // 40),
            text_type=text_type,
            complexity=complexity
        )

    def _build_llm_plan(self, text: str, text_type: str) -> ExtractionPlan:
        """Build plan using LLM."""
        try:
            result = self.planner(
                text=text[:2000],  # Truncate for planning
                text_type=text_type,
                available_extractors=", ".join(self.available_extractors)
            )

            return self._parse_llm_plan(result.plan, text_type)

        except Exception:
            # Fallback to heuristic
            return self._build_heuristic_plan(text, text_type)

    def _parse_llm_plan(self, plan_json: str, text_type: str) -> ExtractionPlan:
        """Parse LLM plan output."""
        try:
            # Handle markdown code blocks
            if "```json" in plan_json:
                match = re.search(r'```json\s*(.*?)\s*```', plan_json, re.DOTALL)
                if match:
                    plan_json = match.group(1)

            data = json.loads(plan_json)

            steps = []
            for step_data in data.get('steps', []):
                steps.append(PlanStep(
                    module=step_data.get('module', 'entity_extraction'),
                    config=step_data.get('config', {}),
                    reason=step_data.get('reason', ''),
                    priority=step_data.get('priority', 0),
                    dependencies=step_data.get('dependencies', [])
                ))

            if not steps:
                raise ValueError("No steps in plan")

            word_count = data.get('estimated_entities', 5) * 20
            complexity = 'simple' if word_count < 100 else 'moderate' if word_count < 500 else 'complex'

            return ExtractionPlan(
                steps=steps,
                estimated_entities=data.get('estimated_entities', 5),
                estimated_relations=data.get('estimated_relations', 3),
                text_type=text_type,
                complexity=complexity
            )

        except (json.JSONDecodeError, KeyError, ValueError):
            return self._build_heuristic_plan("", text_type)


# ═══════════════════════════════════════════════════════════════════════════════
# TASK DECOMPOSER MODULE
# ═══════════════════════════════════════════════════════════════════════════════

class TaskDecomposer(dspy.Module):
    """Decomposes complex extraction tasks into subtasks."""

    def __init__(self, chunk_threshold: int = 4000):
        super().__init__()
        self.chunk_threshold = chunk_threshold
        self.decomposer = dspy.Predict(TaskDecomposition)

    def forward(
        self,
        task_description: str,
        text: str,
        complexity_hints: str = ""
    ) -> dspy.Prediction:
        """
        Decompose task into subtasks.

        Args:
            task_description: High-level task description
            text: Input text (for size estimation)
            complexity_hints: Hints about complexity

        Returns:
            Prediction with subtasks
        """
        text_size = len(text)

        if text_size <= self.chunk_threshold:
            # No decomposition needed
            return dspy.Prediction(
                subtasks=[{
                    'id': 'task_1',
                    'description': task_description,
                    'dependencies': [],
                    'priority': 1
                }],
                subtasks_json=json.dumps([{
                    'id': 'task_1',
                    'description': task_description,
                    'dependencies': [],
                    'priority': 1
                }]),
                needs_decomposition=False
            )

        # Use LLM for decomposition
        result = self.decomposer(
            task_description=task_description,
            text_size=text_size,
            complexity_hints=complexity_hints
        )

        subtasks = self._parse_subtasks(result.subtasks)

        return dspy.Prediction(
            subtasks=subtasks,
            subtasks_json=json.dumps(subtasks),
            needs_decomposition=True
        )

    def _parse_subtasks(self, subtasks_json: str) -> List[Dict]:
        """Parse subtasks from LLM output."""
        try:
            if "```json" in subtasks_json:
                match = re.search(r'```json\s*(.*?)\s*```', subtasks_json, re.DOTALL)
                if match:
                    subtasks_json = match.group(1)

            subtasks = json.loads(subtasks_json)
            return subtasks if isinstance(subtasks, list) else [subtasks]

        except json.JSONDecodeError:
            # Return simple sequential decomposition
            return [
                {'id': 'task_1', 'description': 'Extract entities', 'dependencies': [], 'priority': 1},
                {'id': 'task_2', 'description': 'Extract relations', 'dependencies': ['task_1'], 'priority': 2},
                {'id': 'task_3', 'description': 'Verify graph', 'dependencies': ['task_2'], 'priority': 3}
            ]


# ═══════════════════════════════════════════════════════════════════════════════
# FACTORY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def create_task_planner(use_llm: bool = True) -> TaskPlanner:
    """Create task planner."""
    return TaskPlanner(use_llm=use_llm)


def create_task_decomposer(chunk_threshold: int = 4000) -> TaskDecomposer:
    """Create task decomposer."""
    return TaskDecomposer(chunk_threshold=chunk_threshold)
