const { put } = require('@vercel/blob');
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const id = crypto.randomBytes(5).toString('hex'); // 10-char hex
    await put(`spotify-stats/${id}.json`, JSON.stringify(req.body), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
    });
    res.status(200).json({ id });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
};
