const { list, download } = require('@vercel/blob');

module.exports = async (req, res) => {
  const { id } = req.query;
  if (!id || !/^[a-f0-9]{10}$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const { blobs } = await list({ prefix: `spotify-stats/${id}.json`, limit: 1 });
    if (!blobs.length) return res.status(404).json({ error: 'Not found' });
    const blob = await download(blobs[0].url);
    const data = await blob.json();
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.json(data);
  } catch (err) {
    console.error('Get error:', err);
    res.status(500).json({ error: 'Fetch failed' });
  }
};
