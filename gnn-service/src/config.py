"""
Configuration loader for GNN Service
"""
import os
from pathlib import Path
import yaml
from dotenv import load_dotenv

load_dotenv()

def load_config() -> dict:
    """Load configuration from YAML file with env variable substitution"""

    config_path = Path(__file__).parent.parent / "config" / "gnn_config.yaml"

    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)

    # Substitute environment variables
    config['memgraph']['uri'] = os.getenv('MEMGRAPH_URI', config['memgraph'].get('uri', 'bolt://localhost:7687'))
    config['memgraph']['user'] = os.getenv('MEMGRAPH_USER', 'memgraph')
    config['memgraph']['password'] = os.getenv('MEMGRAPH_PASSWORD', '')

    config['qdrant']['url'] = os.getenv('QDRANT_URL', config['qdrant'].get('url', 'http://localhost:6333'))
    config['redis']['url'] = os.getenv('REDIS_URL', config['redis'].get('url', 'redis://localhost:6379'))

    return config

CONFIG = load_config()
