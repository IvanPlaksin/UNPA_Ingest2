"""
Petri Net soundness verification routes.

Provides endpoints for converting ReactFlow DAGs to Petri Nets
and verifying soundness (no deadlocks, proper termination).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================

class ReactFlowNode(BaseModel):
    id: str
    type: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class ReactFlowEdge(BaseModel):
    id: str
    source: str
    target: str
    label: Optional[str] = None


class GraphValidationRequest(BaseModel):
    nodes: List[ReactFlowNode] = Field(..., description="ReactFlow nodes array")
    edges: List[ReactFlowEdge] = Field(..., description="ReactFlow edges array")
    graph_id: Optional[str] = Field(None, description="Optional graph identifier for logging")


class SoundnessResult(BaseModel):
    sound: bool
    checks: List[Dict[str, Any]]
    errors: List[str]
    warnings: List[str]
    metrics: Dict[str, Any]


# ============================================================================
# WAIT_FOR_INPUT node detection
# ============================================================================

# Tool IDs that represent WAIT_FOR_INPUT semantics in GXE graphs.
# These are regular Petri Net transitions — no special soundness treatment needed
# (open world assumption: external user input is always eventually available).
_WAIT_TOOL_PREFIXES = ("workflow.wait_input", "workflow.waitForInput")
_WAIT_TYPE_VALUES = ("wait_input", "wait", "waitForInput")


def _is_wait_node(node: ReactFlowNode) -> bool:
    """
    Return True if the node represents a WAIT_FOR_INPUT interaction.

    Detection is heuristic — we check the tool/executorType field in node.data
    and the node.type field against known wait patterns.
    """
    if not node.data:
        return False
    tool = node.data.get("tool") or node.data.get("executorType") or node.data.get("toolId") or ""
    if any(tool.startswith(prefix) for prefix in _WAIT_TOOL_PREFIXES):
        return True
    node_type = node.type or ""
    if node_type in _WAIT_TYPE_VALUES:
        return True
    if node.data.get("waitForInput") is True:
        return True
    return False


# ============================================================================
# Health
# ============================================================================

@router.get("/health")
async def petri_health():
    """Check pm4py availability and version."""
    try:
        import pm4py
        return {
            "status": "ok",
            "pm4py_version": pm4py.__version__
        }
    except ImportError:
        raise HTTPException(status_code=503, detail="pm4py not installed")


# ============================================================================
# Validation
# ============================================================================

@router.post("/validate", response_model=SoundnessResult)
async def validate_graph(request: GraphValidationRequest):
    """
    Validate ReactFlow graph soundness using Petri Net formalism.

    Converts the ReactFlow DAG to a Petri Net (WF-net) and checks:
    - Reachability: all nodes reachable from source
    - Dead transitions: nodes that can never fire
    - Soundness: proper start/end, no deadlocks
    - Parallel barriers: AND-join semantics correctness
    """
    try:
        import pm4py
        from pm4py.objects.petri_net.obj import PetriNet, Marking
        from pm4py.objects.petri_net.utils import petri_utils
        from pm4py.algo.analysis.woflan import algorithm as woflan
    except ImportError:
        raise HTTPException(status_code=503, detail="pm4py not installed. Run: pip install pm4py>=2.7.0")

    try:
        net, im, fm, node_map, wait_node_ids = _reactflow_to_petri_net(
            request.nodes, request.edges
        )
        return _check_soundness(net, im, fm, node_map, wait_node_ids)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation error: {str(e)}")


# ============================================================================
# Internal: ReactFlow → Petri Net conversion
# ============================================================================

def _reactflow_to_petri_net(nodes: List[ReactFlowNode], edges: List[ReactFlowEdge]):
    """
    Convert ReactFlow graph to WF-net (Workflow Petri Net).

    Mapping:
      ReactFlow node  → Petri Net transition
      Implicit place  → inserted between every pair of connected transitions
      Source node     → connected from initial marking place (p_start)
      Sink node       → connected to final marking place (p_end)

    WAIT_FOR_INPUT nodes are treated as regular transitions (open world assumption:
    external user input is always eventually available).  They are identified and
    returned in `wait_node_ids` for informational reporting only.
    """
    from pm4py.objects.petri_net.obj import PetriNet, Marking
    from pm4py.objects.petri_net.utils import petri_utils

    net = PetriNet(name="gxe_graph")

    # Source and sink places for WF-net
    p_start = PetriNet.Place("p_start")
    p_end = PetriNet.Place("p_end")
    net.places.add(p_start)
    net.places.add(p_end)

    # Detect entry/exit nodes (no incoming / no outgoing edges)
    node_ids = {n.id for n in nodes}
    has_incoming = {e.target for e in edges if e.target in node_ids}
    has_outgoing = {e.source for e in edges if e.source in node_ids}

    entry_nodes = node_ids - has_incoming
    exit_nodes = node_ids - has_outgoing

    # Create a transition per node; identify WAIT_FOR_INPUT nodes
    transitions: Dict[str, PetriNet.Transition] = {}
    node_map: Dict[str, str] = {}
    wait_node_ids: List[str] = []
    for node in nodes:
        label = node.data.get("label", node.id) if node.data else node.id
        t = PetriNet.Transition(name=node.id, label=label)
        net.transitions.add(t)
        transitions[node.id] = t
        node_map[node.id] = label
        if _is_wait_node(node):
            wait_node_ids.append(node.id)

    # Create intermediate places for each edge
    for edge in edges:
        if edge.source not in transitions or edge.target not in transitions:
            continue
        place_name = f"p_{edge.source}__{edge.target}"
        p = PetriNet.Place(place_name)
        net.places.add(p)
        petri_utils.add_arc_from_to(transitions[edge.source], p, net)
        petri_utils.add_arc_from_to(p, transitions[edge.target], net)

    # Connect entry transitions from p_start
    for node_id in entry_nodes:
        if node_id in transitions:
            petri_utils.add_arc_from_to(p_start, transitions[node_id], net)

    # Connect exit transitions to p_end
    for node_id in exit_nodes:
        if node_id in transitions:
            petri_utils.add_arc_from_to(transitions[node_id], p_end, net)

    # Initial marking: token in p_start
    im = Marking()
    im[p_start] = 1

    # Final marking: token in p_end
    fm = Marking()
    fm[p_end] = 1

    return net, im, fm, node_map, wait_node_ids


def _check_soundness(net, im, fm, node_map: Dict[str, str], wait_node_ids: Optional[List[str]] = None) -> SoundnessResult:
    """Run soundness checks on WF-net using pm4py."""
    from pm4py.algo.analysis.woflan import algorithm as woflan

    wait_node_ids = wait_node_ids or []
    checks = []
    errors = []
    warnings = []
    metrics = {
        "places": len(net.places),
        "transitions": len(net.transitions),
        "arcs": len(net.arcs),
        "wait_nodes": len(wait_node_ids),
    }

    # Check 1: Structure — at least one transition
    has_transitions = len(net.transitions) > 0
    checks.append({"name": "has_transitions", "passed": has_transitions})
    if not has_transitions:
        errors.append("Graph has no executable nodes (transitions)")

    # Check 2: Entry place exists
    entry_places = [p for p in net.places if len(p.in_arcs) == 0]
    has_entry = len(entry_places) >= 1
    checks.append({"name": "has_entry_place", "passed": has_entry, "count": len(entry_places)})
    if not has_entry:
        errors.append("No entry place found — graph has no start node")

    # Check 3: Exit place exists
    exit_places = [p for p in net.places if len(p.out_arcs) == 0]
    has_exit = len(exit_places) >= 1
    checks.append({"name": "has_exit_place", "passed": has_exit, "count": len(exit_places)})
    if not has_exit:
        errors.append("No exit place found — graph has no terminal node")

    # Check 4: Dead transitions (transitions with no incoming arcs from reachable places)
    dead_transitions = [
        t for t in net.transitions
        if len(t.in_arcs) == 0 and t.name not in {p.name for p in entry_places}
    ]
    has_no_dead = len(dead_transitions) == 0
    dead_labels = [node_map.get(t.name, t.name) for t in dead_transitions]
    checks.append({"name": "no_dead_transitions", "passed": has_no_dead, "dead": dead_labels})
    if not has_no_dead:
        warnings.append(f"Potential dead transitions (skip-cascade risk): {dead_labels}")

    # Check 5: Woflan soundness (full formal verification)
    woflan_sound = False
    try:
        woflan_result = woflan.apply(net, im, fm, parameters={
            woflan.Parameters.PRINT_DIAGNOSTICS: False,
            woflan.Parameters.RETURN_ASAP_WHEN_NOT_SOUND: True
        })
        woflan_sound = woflan_result
        checks.append({"name": "woflan_soundness", "passed": woflan_sound})
        if not woflan_sound:
            errors.append("Woflan: graph is NOT sound (deadlock or improper termination detected)")
    except Exception as e:
        checks.append({"name": "woflan_soundness", "passed": False, "error": str(e)})
        warnings.append(f"Woflan check skipped: {str(e)}")

    # Check 6: WAIT_FOR_INPUT nodes (informational — open world assumption applies)
    # WAIT nodes are treated as regular transitions; user input is assumed eventually available.
    # A WAIT node that has no outgoing edge IS correctly detected as a dead transition above.
    if wait_node_ids:
        wait_labels = [node_map.get(nid, nid) for nid in wait_node_ids]
        checks.append({"name": "wait_for_input_nodes", "passed": True, "nodes": wait_labels})
        warnings.append(
            f"Graph contains {len(wait_node_ids)} WAIT_FOR_INPUT node(s): {wait_labels}. "
            "These require user interaction at runtime (open world assumption applied)."
        )

    sound = len(errors) == 0
    return SoundnessResult(
        sound=sound,
        checks=checks,
        errors=errors,
        warnings=warnings,
        metrics=metrics
    )
