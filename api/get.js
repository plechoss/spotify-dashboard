module.exports = async (req, res) => {
  const { id, b } = req.query;
  if (!id || !/^[a-f0-9]{10}$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    // Support legacy ?b= param and new env-var-based URL reconstruction
    let blobUrl;
    if (b) {
      blobUrl = Buffer.from(b, 'base64').toString('utf8');
    } else if (process.env.BLOB_STORE_BASE_URL) {
      blobUrl = `${process.env.BLOB_STORE_BASE_URL}/spotify-stats/${id}.json`;
    } else {
      return res.status(400).json({ error: 'Missing blob reference' });
    }
    const r = await fetch(blobUrl);
    if (!r.ok) return res.status(404).json({ error: 'Not found' });
    const data = await r.json();
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.json(data);
  } catch (err) {
    console.error('Get error:', err);
    res.status(500).json({ error: err.message });
  }
};
