/**
 * UN Knowledge Gateway — Browser Console Export Script
 *
 * Paste this entire file into Chrome DevTools console while authenticated
 * on https://unitednations.sharepoint.com/sites/APP-Gateway
 *
 * When done it copies JSON to clipboard. Paste into:
 *   d:\UN\Repos\UNPA\UNPA_Ingest\api\data\kg-cache.json
 *
 * Then restart the API (or wait for hot-reload).
 */
(async function exportKGDocs() {
  const SITE = '/sites/APP-Gateway';
  const H    = {
    Accept:         'application/json;odata.metadata=minimal',
    'odata-version': '4.0',
  };

  async function spGet(url) {
    const r = await fetch(url, { headers: H });
    if (!r.ok) { console.warn('GET', url, '→', r.status); return null; }
    return r.json();
  }

  console.log('Fetching document libraries...');

  // 1. All document libraries (BaseTemplate=101)
  const listsData = await spGet(
    `${SITE}/_api/web/lists?$filter=BaseTemplate eq 101` +
    `&$select=Id,Title,ItemCount,RootFolder/ServerRelativeUrl&$expand=RootFolder`
  );
  const libs = (listsData?.value || []);
  console.log('Libraries:', libs.map(l => `${l.Title} (${l.ItemCount})`).join(', '));

  const docs = [];

  // 2. Fetch items from each library
  for (const lib of libs) {
    let url = `${SITE}/_api/web/lists(guid'${lib.Id}')/items` +
      `?$select=Id,Title,FileLeafRef,FileRef,UniqueId,Created,Modified,Author/Title,Author/EMail` +
      `&$expand=Author&$top=500&$orderby=Modified desc`;

    let page = 0;
    while (url) {
      const d = await spGet(url);
      if (!d) break;
      const items = (d.value || []).map(i => ({
        title:       i.Title || i.FileLeafRef,
        file:        i.FileLeafRef,
        url:         `https://unitednations.sharepoint.com${i.FileRef}`,
        lib:         lib.Title,
        created:     i.Created,
        modified:    i.Modified,
        author:      i.Author?.Title || null,
        authorEmail: i.Author?.EMail || null,
        id:          i.UniqueId,
      }));
      docs.push(...items);
      console.log(`  "${lib.Title}" page ${++page}: ${items.length} items (running total: ${docs.length})`);
      url = d['@odata.nextLink'] || null;
    }
  }

  // 3. Build output
  const out = {
    libs: libs.map(l => ({
      id:     l.Id,
      title:  l.Title,
      count:  l.ItemCount,
      folder: l.RootFolder?.ServerRelativeUrl,
    })),
    docs,
    at:      new Date().toISOString(),
    siteUrl: `https://unitednations.sharepoint.com${SITE}`,
  };

  // 4. Copy to clipboard
  const json = JSON.stringify(out, null, 2);
  await navigator.clipboard.writeText(json);

  console.log(`\n✓ Done! ${docs.length} docs across ${libs.length} libraries.`);
  console.log('Paste clipboard into: d:\\UN\\Repos\\UNPA\\UNPA_Ingest\\api\\data\\kg-cache.json');

  return out;
})();
