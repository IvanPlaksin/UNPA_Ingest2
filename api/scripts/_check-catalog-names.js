const http = require('http');
http.get('http://localhost:3010/api/v1/graph-catalog?limit=500', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const entries = JSON.parse(d).data || [];

    // Group by normalized base name
    const byName = {};
    entries.forEach(e => {
      let base = (e.name || '')
        .replace(/\s*\(Copy\)\s*/g, '')
        .replace(/\s+v\d+$/i, '')
        .trim();
      if (!byName[base]) byName[base] = [];
      byName[base].push({
        id: e.id,
        name: e.name,
        version: e.currentVersion,
        ns: e.namespace,
        type: e.type,
        nodes: (e.nodes || []).length,
        edges: (e.edges || []).length,
        created: e.createdAt,
        tags: e.tags || [],
        description: (e.description || '').substring(0, 80),
      });
    });

    // Show ALL groups - single and multi
    const multi = Object.entries(byName).filter(([, v]) => v.length > 1);
    const single = Object.entries(byName).filter(([, v]) => v.length === 1);

    console.log(`Total entries: ${entries.length}`);
    console.log(`Unique base names: ${Object.keys(byName).length}`);
    console.log(`Groups with 2+ entries (potential versions): ${multi.length}\n`);

    multi.sort(([a], [b]) => a.localeCompare(b));
    multi.forEach(([base, items]) => {
      console.log(`\n=== ${base} (${items.length} entries) ===`);
      items.sort((a, b) => (a.created || '').localeCompare(b.created || '')).forEach(i => {
        console.log(`  ${i.id.substring(0, 16).padEnd(16)}  v${i.version}  ${i.nodes}N/${i.edges}E  [${i.ns}]  "${i.name}"  tags:[${i.tags.join(',')}]  ${(i.created || '').substring(0, 10)}`);
      });
    });
  });
});
