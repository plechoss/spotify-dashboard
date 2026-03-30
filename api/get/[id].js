const { list } = require('@vercel/blob');

module.exports = async (req, res) => {
  const { id, store } = req.query;
  if (!id || !/^[a-f0-9]{10}$/.test(id)) return res.status(400).json({ error: 'Invalid ID', id });
  try {
    // Strategy 1: direct URL from store param
    if (store) {
      const blobUrl = `https://${store}.public.blob.vercel-storage.com/spotify-stats/${id}.json`;
      console.log('Trying direct URL:', blobUrl);
      const r = await fetch(blobUrl);
      if (r.ok) {
        const data = await r.json();
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
        return res.json(data);
      }
      console.log('Direct URL failed:', r.status);
    }

    // Strategy 2: construct from token
    const token = process.env.BLOB_READ_WRITE_TOKEN || '';
    const match = token.match(/vercel_blob_rw_([^_]+)_/);
    if (match) {
      const blobUrl = `https://${match[1]}.public.blob.vercel-storage.com/spotify-stats/${id}.json`;
      console.log('Trying token URL:', blobUrl);
      const r = await fetch(blobUrl);
      if (r.ok) {
        const data = await r.json();
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
        return res.json(data);
      }
      console.log('Token URL failed:', r.status);
    }

    // Strategy 3: list() fallback
    console.log('Trying list() for:', id);
    const { blobs } = await list({ prefix: `spotify-stats/${id}.json`, limit: 1 });
    if (!blobs.length) {
      console.log('list() returned empty');
      return res.status(404).json({ error: 'Not found', id, store: store || null });
    }
    console.log('list() found:', blobs[0].url);
    const r = await fetch(blobs[0].url);
    if (!r.ok) throw new Error('Blob fetch failed: ' + r.status);
    const data = await r.json();
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.json(data);
  } catch (err) {
    console.error('Get error:', err);
    res.status(500).json({ error: err.message });
  }
};
