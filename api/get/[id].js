module.exports = async (req, res) => {
  const { id, b } = req.query;
  if (!id || !/^[a-f0-9]{10}$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });
  if (!b) return res.status(400).json({ error: 'Missing blob reference' });
  try {
    const blobUrl = Buffer.from(b, 'base64').toString('utf8');
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
