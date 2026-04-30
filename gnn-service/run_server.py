#!/usr/bin/env python3
"""
GNN Service entry point
"""
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.api.main import run_server

if __name__ == "__main__":
    run_server()
