"""
GNN Data Audit Script — Phase C1.1

Checks if the Memgraph knowledge graph has sufficient data for GNN training.
Adapted for Memgraph (no MAGE weakly_connected_components — uses manual BFS).

Run: python scripts/data_audit.py
Or use Node.js version: node api/scripts/gnn-data-audit.js
"""

import sys
import os
from pathlib import Path
from collections import defaultdict

# Add parent to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from neo4j import GraphDatabase

# --- Configuration ---

MINIMUM_REQUIREMENTS = {
    'total_nodes': 500,
    'total_edges': 1000,
    'labeled_nodes': 200,
    'min_class_samples': 20,
    'edge_types': 3,
    'largest_component_ratio': 0.7,
}

MEMGRAPH_URI = os.getenv('MEMGRAPH_URI', 'bolt://localhost:7687')
MEMGRAPH_USER = os.getenv('MEMGRAPH_USER', 'memgraph')
MEMGRAPH_PASSWORD = os.getenv('MEMGRAPH_PASSWORD', '')


# --- Queries ---

def get_node_stats(session):
    """Get node counts by label."""
    result = session.run("""
        MATCH (n)
        WITH labels(n) AS lbls, count(*) AS cnt
        UNWIND lbls AS label
        RETURN label, sum(cnt) AS count
        ORDER BY count DESC
    """)
    return [(r['label'], r['count']) for r in result]


def get_edge_stats(session):
    """Get edge counts by type."""
    result = session.run("""
        MATCH ()-[r]->()
        RETURN type(r) AS type, count(*) AS count
        ORDER BY count DESC
    """)
    return [(r['type'], r['count']) for r in result]


def get_labeled_nodes(session):
    """Get labeled nodes for classification (by quantum_type / entityType / category)."""
    result = session.run("""
        MATCH (n)
        WHERE n.type IS NOT NULL OR n.entityType IS NOT NULL OR n.category IS NOT NULL
        WITH coalesce(n.type, n.entityType, n.category) AS label, count(*) AS count
        RETURN label, count
        ORDER BY count DESC
    """)
    return [(r['label'], r['count']) for r in result]


def get_nodes_with_embeddings(session):
    """Count nodes that have Qdrant vector IDs."""
    result = session.run("""
        MATCH (n)
        WHERE n.qdrant_vector_id IS NOT NULL
        RETURN count(n) AS count
    """)
    return result.single()['count']


def count_connected_components(session):
    """
    Manual BFS to count weakly connected components.
    Memgraph may not have MAGE weakly_connected_components.
    """
    # Get all node internal IDs
    result = session.run("""
        MATCH (n)
        RETURN id(n) AS nid
    """)
    all_nodes = set()
    for r in result:
        all_nodes.add(r['nid'])

    if not all_nodes:
        return {'num_components': 0, 'largest': 0, 'sizes': []}

    # Get all edges (undirected for weak connectivity)
    result = session.run("""
        MATCH (a)-[r]-(b)
        RETURN DISTINCT id(a) AS source, id(b) AS target
    """)

    adj = defaultdict(set)
    for r in result:
        adj[r['source']].add(r['target'])
        adj[r['target']].add(r['source'])

    # BFS to find components
    visited = set()
    components = []

    for start_node in all_nodes:
        if start_node in visited:
            continue
        component_size = 0
        queue = [start_node]
        while queue:
            node = queue.pop(0)
            if node in visited:
                continue
            visited.add(node)
            component_size += 1
            queue.extend(adj.get(node, set()) - visited)
        components.append(component_size)

    components.sort(reverse=True)
    total = sum(components)

    return {
        'num_components': len(components),
        'largest': components[0] if components else 0,
        'largest_ratio': components[0] / total if total > 0 else 0,
        'avg_size': total / len(components) if components else 0,
        'top_10': components[:10],
        'orphans': sum(1 for c in components if c == 1),
    }


def check_readiness(stats):
    """Check if data is sufficient for GNN training."""
    issues = []
    warnings = []
    req = MINIMUM_REQUIREMENTS

    total_nodes = stats['total_nodes']
    total_edges = stats['total_edges']
    total_labeled = stats['total_labeled']
    edge_types = stats['edge_type_count']
    comp = stats['components']

    if total_nodes < req['total_nodes']:
        issues.append(f"Insufficient nodes: {total_nodes} < {req['total_nodes']} required")
    if total_edges < req['total_edges']:
        issues.append(f"Insufficient edges: {total_edges} < {req['total_edges']} required")
    if total_labeled < req['labeled_nodes']:
        warnings.append(f"Low labeled nodes: {total_labeled} < {req['labeled_nodes']} recommended")
    if edge_types < req['edge_types']:
        warnings.append(f"Low edge type diversity: {edge_types} < {req['edge_types']} recommended")

    # Check class balance
    if stats['labeled']:
        min_class = min(c for _, c in stats['labeled'])
        if min_class < req['min_class_samples']:
            warnings.append(f"Class imbalance: smallest class has {min_class} samples (need {req['min_class_samples']})")

    # Check connectivity
    if comp['largest_ratio'] < req['largest_component_ratio']:
        warnings.append(
            f"Fragmented graph: largest component is {comp['largest_ratio']:.1%} "
            f"(need {req['largest_component_ratio']:.0%})"
        )

    return {
        'ready': len(issues) == 0,
        'issues': issues,
        'warnings': warnings,
    }


def main():
    print("=" * 65)
    print("                    GNN DATA AUDIT REPORT")
    print("=" * 65)
    print(f"\nConnecting to Memgraph: {MEMGRAPH_URI}")

    driver = GraphDatabase.driver(MEMGRAPH_URI, auth=(MEMGRAPH_USER, MEMGRAPH_PASSWORD))

    try:
        with driver.session() as session:
            # Node stats
            node_stats = get_node_stats(session)
            total_nodes = sum(c for _, c in node_stats)

            # Edge stats
            edge_stats = get_edge_stats(session)
            total_edges = sum(c for _, c in edge_stats)

            # Labeled nodes
            labeled = get_labeled_nodes(session)
            total_labeled = sum(c for _, c in labeled)

            # Embeddings
            nodes_with_vectors = get_nodes_with_embeddings(session)

            # Connectivity (may be slow on large graphs)
            print("\nComputing connected components (BFS)...")
            components = count_connected_components(session)

        # Collect stats
        stats = {
            'total_nodes': total_nodes,
            'total_edges': total_edges,
            'total_labeled': total_labeled,
            'nodes_with_vectors': nodes_with_vectors,
            'node_type_count': len(node_stats),
            'edge_type_count': len(edge_stats),
            'node_stats': node_stats,
            'edge_stats': edge_stats,
            'labeled': labeled,
            'components': components,
        }

        # Print report
        print(f"\nGRAPH STATISTICS")
        print("-" * 40)
        print(f"  Total Nodes:           {total_nodes:,}")
        print(f"  Total Edges:           {total_edges:,}")
        print(f"  Node Types:            {len(node_stats)}")
        print(f"  Edge Types:            {len(edge_stats)}")
        print(f"  Nodes with Vectors:    {nodes_with_vectors:,}")

        print(f"\nNODE TYPE DISTRIBUTION")
        print("-" * 40)
        for label, count in node_stats[:15]:
            print(f"  {label:<25} {count:>8,}")
        if len(node_stats) > 15:
            print(f"  ... and {len(node_stats) - 15} more types")

        print(f"\nEDGE TYPE DISTRIBUTION")
        print("-" * 40)
        for etype, count in edge_stats[:15]:
            print(f"  {etype:<25} {count:>8,}")
        if len(edge_stats) > 15:
            print(f"  ... and {len(edge_stats) - 15} more types")

        print(f"\nLABELED NODES (for classification)")
        print("-" * 40)
        if labeled:
            for label, count in labeled[:15]:
                print(f"  {str(label):<25} {count:>8,}")
            if len(labeled) > 15:
                print(f"  ... and {len(labeled) - 15} more classes")
        else:
            print("  No labeled nodes found")

        print(f"\nCONNECTIVITY")
        print("-" * 40)
        comp = components
        print(f"  Connected Components:  {comp['num_components']:,}")
        print(f"  Largest Component:     {comp['largest']:,} nodes ({comp['largest_ratio']:.1%})")
        print(f"  Orphan Nodes:          {comp['orphans']:,}")
        print(f"  Top Component Sizes:   {comp['top_10']}")

        # Readiness check
        readiness = check_readiness(stats)

        print(f"\nTRAINING READINESS")
        print("-" * 40)
        checks = [
            (total_nodes >= MINIMUM_REQUIREMENTS['total_nodes'],
             f"Sufficient nodes ({total_nodes:,} >= {MINIMUM_REQUIREMENTS['total_nodes']})"),
            (total_edges >= MINIMUM_REQUIREMENTS['total_edges'],
             f"Sufficient edges ({total_edges:,} >= {MINIMUM_REQUIREMENTS['total_edges']})"),
            (total_labeled >= MINIMUM_REQUIREMENTS['labeled_nodes'],
             f"Sufficient labeled nodes ({total_labeled:,} >= {MINIMUM_REQUIREMENTS['labeled_nodes']})"),
            (comp['largest_ratio'] >= MINIMUM_REQUIREMENTS['largest_component_ratio'],
             f"Graph connected ({comp['largest_ratio']:.1%} in main component)"),
        ]

        for ok, msg in checks:
            icon = "[OK]" if ok else "[!!]"
            print(f"  {icon} {msg}")

        if readiness['warnings']:
            print(f"\n  Warnings:")
            for w in readiness['warnings']:
                print(f"    [!] {w}")

        verdict = "READY FOR TRAINING" if readiness['ready'] else "NOT READY"
        suffix = " (with warnings)" if readiness['warnings'] and readiness['ready'] else ""
        print(f"\n{'=' * 65}")
        print(f"  VERDICT: {verdict}{suffix}")
        print(f"{'=' * 65}")

        return stats, readiness

    finally:
        driver.close()


if __name__ == "__main__":
    main()
