module.exports = async (req, res) => {
  const { id, store } = req.query;
  if (!id || !/^[a-f0-9]{10}$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    // Use store subdomain from query param (set by upload endpoint)
    // Fall back to parsing it from the token for old share URLs
    let storeId = store;
    if (!storeId) {
      const token = process.env.BLOB_READ_WRITE_TOKEN || '';
      const match = token.match(/vercel_blob_rw_([^_]+)_/);
      if (!match) throw new Error('Blob store not configured');
      storeId = match[1];
    }
    const blobUrl = `https://${storeId}.public.blob.vercel-storage.com/spotify-stats/${id}.json`;
    const r = await fetch(blobUrl);
    if (!r.ok) return res.status(404).json({ error: 'Not found' });
    const data = await r.json();
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.json(data);
  } catch (err) {
    console.error('Get error:', err);
    res.status(500).json({ error: 'Fetch failed' });
  }
};
