"""
Test data pipeline - verify Memgraph and Qdrant connectivity
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.data.memgraph_loader import get_loader
from src.data.qdrant_features import get_feature_loader
from src.data.dataset import ProjectAdvisorDataset


def test_memgraph():
    print("\n" + "=" * 50)
    print("Testing Memgraph Connection")
    print("=" * 50)

    try:
        with get_loader() as loader:
            node_counts = loader.get_node_counts()
            edge_counts = loader.get_edge_counts()

            print("\nNode counts:")
            for label, count in node_counts.items():
                print(f"  {label}: {count}")

            print("\nEdge counts:")
            for etype, count in edge_counts.items():
                print(f"  {etype}: {count}")

            print("\n✓ Memgraph connection successful")
            return True
    except Exception as e:
        print(f"\n✗ Memgraph connection failed: {e}")
        return False


def test_qdrant():
    print("\n" + "=" * 50)
    print("Testing Qdrant Connection")
    print("=" * 50)

    try:
        with get_feature_loader() as loader:
            info = loader.collection_info()

            print(f"\nCollection: {loader.collection}")
            print(f"  Vectors count: {info['vectors_count']}")
            print(f"  Points count: {info['points_count']}")
            print(f"  Vector size: {info['vector_size']}")

            print("\n✓ Qdrant connection successful")
            return True
    except Exception as e:
        print(f"\n✗ Qdrant connection failed: {e}")
        return False


def test_dataset():
    print("\n" + "=" * 50)
    print("Testing Dataset Loading")
    print("=" * 50)

    try:
        dataset = ProjectAdvisorDataset(use_qdrant_features=False)
        dataset.load()

        data = dataset.get_data()
        print(f"\nGraph loaded:")
        print(f"  Nodes: {data.num_nodes}")
        print(f"  Edges: {data.edge_index.shape[1]}")
        print(f"  Features shape: {data.x.shape}")

        print("\n✓ Dataset loading successful")
        return True
    except Exception as e:
        print(f"\n✗ Dataset loading failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("=" * 50)
    print("GNN Data Pipeline Test")
    print("=" * 50)

    results = [
        test_memgraph(),
        test_qdrant(),
        test_dataset()
    ]

    print("\n" + "=" * 50)
    print("Summary")
    print("=" * 50)

    if all(results):
        print("All tests passed! ✓")
        return 0
    else:
        print("Some tests failed. Check connectivity and configuration.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
