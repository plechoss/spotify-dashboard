const { put } = require('@vercel/blob');
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const id = crypto.randomBytes(5).toString('hex'); // 10-char hex
    const blob = await put(`spotify-stats/${id}.json`, JSON.stringify(req.body), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });
    // Extract store subdomain from the returned URL so the client can pass it to /api/get
    const storeMatch = blob.url.match(/https:\/\/([^.]+)\.public\.blob/);
    const store = storeMatch ? storeMatch[1] : '';
    res.status(200).json({ id, store });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
};
