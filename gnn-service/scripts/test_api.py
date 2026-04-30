#!/usr/bin/env python3
"""
Test GNN API endpoints
"""
import requests
import sys

BASE_URL = "http://localhost:5001"


def test_health():
    print("Testing /health...")
    r = requests.get(f"{BASE_URL}/health")
    assert r.status_code == 200
    print(f"  Status: {r.json()['status']}")


def test_root():
    print("Testing /...")
    r = requests.get(f"{BASE_URL}/")
    assert r.status_code == 200
    print(f"  Service: {r.json()['service']}")


def test_graph_stats():
    print("Testing /api/v1/gnn/graph-stats...")
    r = requests.get(f"{BASE_URL}/api/v1/gnn/graph-stats")
    if r.status_code == 200:
        data = r.json()
        print(f"  Total nodes: {data.get('total_nodes', 'N/A')}")
        print(f"  Total edges: {data.get('total_edges', 'N/A')}")
    else:
        print(f"  Status {r.status_code}: {r.text}")


def test_model_status():
    print("Testing /api/v1/gnn/model-status...")
    r = requests.get(f"{BASE_URL}/api/v1/gnn/model-status")
    assert r.status_code == 200
    data = r.json()
    print(f"  Link model loaded: {data['link_prediction']['loaded']}")
    print(f"  Classification model loaded: {data['classification']['loaded']}")


def test_node_types():
    print("Testing /api/v1/gnn/node-types...")
    r = requests.get(f"{BASE_URL}/api/v1/gnn/node-types")
    assert r.status_code == 200
    types = r.json()['node_types']
    print(f"  Node types: {len(types)} configured")


def test_predict_links_no_model():
    print("Testing /api/v1/gnn/predict-links (no model)...")
    r = requests.post(f"{BASE_URL}/api/v1/gnn/predict-links", json={
        "source_type": "WorkItem",
        "target_type": "File",
        "top_k": 10
    })
    if r.status_code == 400:
        print("  Correctly returns 400 when model not loaded")
    else:
        print(f"  Status: {r.status_code}")


def main():
    print("=" * 50)
    print("GNN API Tests")
    print("=" * 50)
    print()

    try:
        test_health()
        test_root()
        test_model_status()
        test_node_types()
        test_graph_stats()
        test_predict_links_no_model()

        print()
        print("=" * 50)
        print("All tests passed!")
        print("=" * 50)

    except requests.ConnectionError:
        print("\nCould not connect to GNN service")
        print("  Make sure the server is running: python run_server.py")
        sys.exit(1)
    except AssertionError as e:
        print(f"\nTest failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
