"""
Environment check script - verifies all dependencies are available
"""
import sys

def check_torch():
    try:
        import torch
        print(f"✓ PyTorch {torch.__version__}")
        print(f"  CUDA available: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            print(f"  CUDA version: {torch.version.cuda}")
        return True
    except ImportError as e:
        print(f"✗ PyTorch not installed: {e}")
        return False

def check_pyg():
    try:
        import torch_geometric
        print(f"✓ PyTorch Geometric {torch_geometric.__version__}")
        return True
    except ImportError as e:
        print(f"✗ PyTorch Geometric not installed: {e}")
        return False

def check_memgraph():
    try:
        from neo4j import GraphDatabase
        print("✓ Neo4j driver (for Memgraph)")
        return True
    except ImportError as e:
        print(f"✗ Neo4j driver not installed: {e}")
        return False

def check_qdrant():
    try:
        from qdrant_client import QdrantClient
        print("✓ Qdrant client")
        return True
    except ImportError as e:
        print(f"✗ Qdrant client not installed: {e}")
        return False

def check_fastapi():
    try:
        import fastapi
        print(f"✓ FastAPI {fastapi.__version__}")
        return True
    except ImportError as e:
        print(f"✗ FastAPI not installed: {e}")
        return False

def main():
    print("=" * 50)
    print("GNN Service Environment Check")
    print("=" * 50)

    checks = [
        check_torch(),
        check_pyg(),
        check_memgraph(),
        check_qdrant(),
        check_fastapi(),
    ]

    print("=" * 50)
    if all(checks):
        print("All dependencies OK!")
        sys.exit(0)
    else:
        print("Some dependencies missing. Run: pip install -r requirements.txt")
        sys.exit(1)

if __name__ == "__main__":
    main()
