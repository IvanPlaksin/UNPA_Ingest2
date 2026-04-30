"""
Migration script: local Memgraph + Qdrant → Azure
Usage:
  python migrate-to-azure.py --memgraph
  python migrate-to-azure.py --qdrant
  python migrate-to-azure.py --all
"""

import argparse
import sys
import time
import requests

# Fix Windows console encoding
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ─── Config ───────────────────────────────────────────────────────────────────
LOCAL_BOLT         = 'bolt://localhost:7687'
LOCAL_BOLT_AUTH    = ('memgraph', 'secret_password_123')
LOCAL_QDRANT       = 'http://localhost:6333'
AZURE_API          = 'https://unpa-api.salmonsmoke-6ce7cdfe.eastus.azurecontainerapps.io/api/v1'
BATCH_NODES        = 200    # nodes per UNWIND batch
BATCH_EDGES        = 150    # edges per UNWIND batch
BATCH_VECTORS      = 100    # Qdrant points per upsert

# ─── Azure Cypher helper ──────────────────────────────────────────────────────

def az_cypher(query: str, params: dict = None, force: bool = False):
    url = f'{AZURE_API}/knowledge/crud/execute'
    if force:
        url += '?force=true'
    r = requests.post(url, json={'query': query, 'params': params or {}}, timeout=120)
    if r.status_code not in (200, 201):
        raise RuntimeError(f'HTTP {r.status_code}: {r.text[:300]}')
    return r.json()

def p(msg, end='\n'):
    print(msg, end=end, flush=True)

# ─── Serializer ──────────────────────────────────────────────────────────────

def serialize(val):
    if val is None:
        return None
    if isinstance(val, (bool, int, float, str)):
        return val
    if isinstance(val, list):
        return [serialize(v) for v in val]
    if isinstance(val, dict):
        return {k: serialize(v) for k, v in val.items()}
    if hasattr(val, 'iso_format'):   # neo4j DateTime
        return val.iso_format()
    return str(val)

def clean_props(props: dict) -> dict:
    return {k: serialize(v) for k, v in props.items() if k != '__mg_id__'}

# ─── MEMGRAPH ────────────────────────────────────────────────────────────────

def migrate_memgraph():
    from neo4j import GraphDatabase

    p('\n╔══════════════════════════════════╗')
    p(  '║       MEMGRAPH MIGRATION         ║')
    p(  '╚══════════════════════════════════╝')

    driver = GraphDatabase.driver(LOCAL_BOLT, auth=LOCAL_BOLT_AUTH)

    # ── 1. Count what's on Azure ──────────────────────────────────────────────
    p('\n[1/5] Checking Azure node count...')
    try:
        resp = az_cypher('MATCH (n) RETURN count(n) AS c')
        existing = _extract_count(resp)
    except Exception as e:
        p(f'  ⚠  Could not reach Azure: {e}')
        driver.close()
        return
    p(f'      Azure nodes: {existing:,}')
    if existing > 0 and not getattr(migrate_memgraph, '_force', False):
        ans = input(f'  ⚠  Azure has {existing:,} nodes. Continue and add? [y/N] ').strip().lower()
        if ans != 'y':
            driver.close()
            return

    # ── 2. Export nodes ───────────────────────────────────────────────────────
    p('\n[2/5] Exporting nodes...')
    nodes = []
    with driver.session() as s:
        for rec in s.run('MATCH (n) RETURN id(n) AS mid, labels(n) AS lbls, properties(n) AS props'):
            nodes.append({
                'mid': rec['mid'],
                'lbls': rec['lbls'],
                'props': clean_props(dict(rec['props']))
            })
    p(f'      {len(nodes):,} nodes exported')

    # ── 3. Export edges ───────────────────────────────────────────────────────
    p('\n[3/5] Exporting edges...')
    edges = []
    with driver.session() as s:
        for rec in s.run('MATCH (a)-[e]->(b) RETURN id(a) AS s, id(b) AS t, type(e) AS rel, properties(e) AS props'):
            edges.append({
                's': rec['s'],
                't': rec['t'],
                'rel': rec['rel'],
                'props': clean_props(dict(rec['props']))
            })
    p(f'      {len(edges):,} edges exported')
    driver.close()

    # ── 4. Import nodes ───────────────────────────────────────────────────────
    p('\n[4/5] Importing nodes to Azure...')

    # Create index for fast edge lookup
    p('      Creating __mg_id__ index...')
    try:
        az_cypher('CREATE INDEX ON :__MIG__(__mg_id__)', force=True)
    except Exception as e:
        p(f'      Index warning: {e}')

    err = 0
    done = 0
    # Group by label combination for type-specific CREATEs
    from collections import defaultdict
    by_labels = defaultdict(list)
    for n in nodes:
        key = '||'.join(sorted(n['lbls']))
        by_labels[key].append(n)

    for lbl_key, group in by_labels.items():
        lbls = lbl_key.split('||')
        lbl_str = ':'.join(f'`{l}`' for l in lbls) + ':`__MIG__`'
        for i in range(0, len(group), BATCH_NODES):
            batch = group[i:i + BATCH_NODES]
            rows = [{'mid': n['mid'], 'props': n['props']} for n in batch]
            q = f'UNWIND $rows AS r CREATE (n:{lbl_str}) SET n = r.props, n.__mg_id__ = r.mid'
            try:
                az_cypher(q, {'rows': rows})
            except Exception as e:
                err += 1
            done += len(batch)
            p(f'\r      {done:,}/{len(nodes):,}  errors:{err}', end='')
    p(f'\n      ✓ Nodes done (errors: {err})')

    # ── 5. Import edges ───────────────────────────────────────────────────────
    p('\n[5/5] Importing edges to Azure...')
    by_rel = defaultdict(list)
    for e in edges:
        by_rel[e['rel']].append(e)

    err = 0
    done = 0
    for rel_type, group in by_rel.items():
        for i in range(0, len(group), BATCH_EDGES):
            batch = group[i:i + BATCH_EDGES]
            rows = [{'s': e['s'], 't': e['t'], 'props': e['props']} for e in batch]
            q = f'''
UNWIND $rows AS r
MATCH (a:__MIG__ {{__mg_id__: r.s}}), (b:__MIG__ {{__mg_id__: r.t}})
CREATE (a)-[e:`{rel_type}`]->(b) SET e = r.props
'''
            try:
                az_cypher(q, {'rows': rows})
            except Exception as e2:
                err += 1
            done += len(batch)
            p(f'\r      {done:,}/{len(edges):,}  errors:{err}', end='')
    p(f'\n      ✓ Edges done (errors: {err})')

    # Cleanup migration helpers
    p('      Cleaning up __MIG__ label and __mg_id__ property...')
    try:
        az_cypher('MATCH (n:__MIG__) REMOVE n:__MIG__, n.__mg_id__', force=True)
    except Exception as e:
        p(f'      Cleanup warning: {e}')

    p('\n  ✅ Memgraph migration complete!')


def _extract_count(resp):
    """Extract scalar count from crud/execute response."""
    if isinstance(resp, dict):
        results = resp.get('results') or resp.get('data') or []
        if isinstance(results, list) and results:
            r = results[0]
            if isinstance(r, dict):
                return list(r.values())[0]
    return 0

# ─── QDRANT ──────────────────────────────────────────────────────────────────

def migrate_qdrant(azure_url: str):
    try:
        from qdrant_client import QdrantClient
        from qdrant_client.models import PointStruct
    except ImportError:
        p('  ✗ qdrant-client not installed: pip install qdrant-client')
        return

    p('\n╔══════════════════════════════════╗')
    p(  '║       QDRANT MIGRATION           ║')
    p(  '╚══════════════════════════════════╝')

    local_q = QdrantClient(url=LOCAL_QDRANT, timeout=60)
    azure_q = QdrantClient(url=azure_url, timeout=120)

    collections = [c.name for c in local_q.get_collections().collections]
    p(f'\n  {len(collections)} local collections found')

    migrated = skipped = errors = 0
    for name in sorted(collections):
        local_info = local_q.get_collection(name)
        local_count = local_info.points_count or 0

        try:
            azure_info = azure_q.get_collection(name)
            azure_count = azure_info.points_count or 0
        except Exception:
            azure_count = -1  # doesn't exist yet

        if azure_count >= local_count > 0:
            p(f'  ✓ {name} ({local_count:,} pts) — already synced')
            skipped += 1
            continue

        p(f'\n  → {name}  ({local_count:,} pts, azure: {max(0,azure_count):,})')

        # Recreate collection on Azure if needed
        if azure_count < 0:
            try:
                azure_q.recreate_collection(
                    collection_name=name,
                    vectors_config=local_info.config.params.vectors
                )
            except Exception as e:
                p(f'    ⚠ Create error: {e}')
                errors += 1
                continue

        # Scroll + upload all points
        offset = None
        uploaded = 0
        while True:
            try:
                pts, next_offset = local_q.scroll(
                    collection_name=name,
                    offset=offset,
                    limit=BATCH_VECTORS,
                    with_vectors=True,
                    with_payload=True
                )
            except Exception as e:
                p(f'\n    ⚠ Scroll error: {e}')
                break
            if not pts:
                break
            try:
                azure_q.upsert(
                    collection_name=name,
                    points=[PointStruct(id=pt.id, vector=pt.vector, payload=pt.payload or {}) for pt in pts]
                )
            except Exception as e:
                p(f'\n    ⚠ Upsert error: {e}')
                errors += 1
            uploaded += len(pts)
            p(f'\r    {uploaded:,}/{local_count:,}', end='')
            if next_offset is None:
                break
            offset = next_offset

        p(f'\n    ✅ {uploaded:,} points uploaded')
        migrated += 1

    p(f'\n  ✅ Qdrant done — migrated: {migrated}, skipped: {skipped}, errors: {errors}')

# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description='Migrate local DBs → Azure')
    ap.add_argument('--memgraph',   action='store_true')
    ap.add_argument('--qdrant',     action='store_true')
    ap.add_argument('--qdrant-url', default=None, help='Azure Qdrant external URL')
    ap.add_argument('--all',        action='store_true')
    ap.add_argument('--force',      action='store_true', help='Skip confirmation prompts')
    args = ap.parse_args()

    if not any([args.memgraph, args.qdrant, args.all]):
        ap.print_help(); sys.exit(1)

    if args.memgraph or args.all:
        migrate_memgraph._force = args.force
        migrate_memgraph()

    if args.qdrant or args.all:
        if not args.qdrant_url:
            p('\n⚠  Qdrant is internal in Azure. Make it external first:')
            p('   az containerapp ingress update --name unpa-qdrant --resource-group unpa-rg --type external --target-port 6333')
            p('   Then get FQDN: az containerapp show --name unpa-qdrant --resource-group unpa-rg --query "properties.configuration.ingress.fqdn" -o tsv')
            p('   Then run:   python migrate-to-azure.py --qdrant --qdrant-url https://<fqdn>')
            sys.exit(1)
        migrate_qdrant(args.qdrant_url)

    p('\n🎉 Done!')

if __name__ == '__main__':
    main()
