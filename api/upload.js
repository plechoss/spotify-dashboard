const { put } = require('@vercel/blob');
const crypto = require('crypto');

const ID_RE = /^[a-f0-9]{10}$/;

function normalizeStats(payload) {
  if (payload && typeof payload === 'object' && payload.stats && typeof payload.stats === 'object') {
    return payload.stats;
  }
  if (payload && typeof payload === 'object') return payload;
  return null;
}

function hash(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function legacyAccountSignature(stats) {
  if (!stats || typeof stats !== 'object') return null;
  const firstYear = Object.keys(stats.by_year || {}).sort()[0] || '';
  const y = (stats.by_year && stats.by_year[firstYear]) || {};
  const base = {
    first_play: stats.overview?.first_play || '',
    first_year: firstYear,
    first_year_top_artists: (y.top_artists || []).slice(0, 5).map(a => a?.name || ''),
    first_year_top_songs: (y.top_songs || []).slice(0, 5).map(s => `${s?.artist || ''}\x00${s?.name || ''}`),
    first_year_top_albums: (y.top_albums || []).slice(0, 5).map(a => `${a?.artist || ''}\x00${a?.name || ''}`),
  };
  return hash(JSON.stringify(base));
}

function getAccountMarkers(stats) {
  const fp = typeof stats?.account_fingerprint === 'string' ? stats.account_fingerprint.trim() : '';
  return {
    fingerprint: fp || null,
    legacy: legacyAccountSignature(stats),
  };
}

function pickComparableMarker(existing, incoming) {
  if (existing.fingerprint && incoming.fingerprint) return 'fingerprint';
  if (existing.legacy && incoming.legacy) return 'legacy';
  return null;
}

function decodeBlobUrl(encoded) {
  if (!encoded) return null;
  try {
    const url = Buffer.from(encoded, 'base64').toString('utf8');
    if (/^https?:\/\/.+/i.test(url)) return url;
    return null;
  } catch {
    return null;
  }
}

function resolveBlobUrlForId(id, encodedBlobUrl) {
  const fromParam = decodeBlobUrl(encodedBlobUrl);
  if (fromParam) return fromParam;
  if (process.env.BLOB_STORE_BASE_URL) {
    return `${process.env.BLOB_STORE_BASE_URL}/spotify-stats/${id}.json`;
  }
  return null;
}

async function fetchExistingPayload(blobUrl) {
  const r = await fetch(blobUrl);
  if (!r.ok) return null;
  return r.json();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const requestedId = req.query?.id;
    const isUpdate = typeof requestedId === 'string' && requestedId.length > 0;
    if (isUpdate && !ID_RE.test(requestedId)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const incomingStats = normalizeStats(req.body);
    if (!incomingStats) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const id = isUpdate ? requestedId : crypto.randomBytes(5).toString('hex');

    if (isUpdate) {
      const existingBlobUrl = resolveBlobUrlForId(id, req.query?.b);
      if (!existingBlobUrl) {
        return res.status(400).json({ error: 'Missing blob reference for update' });
      }
      const existingPayload = await fetchExistingPayload(existingBlobUrl);
      if (!existingPayload) {
        return res.status(404).json({ error: 'Shared stats not found' });
      }

      const existingStats = normalizeStats(existingPayload);
      const existingMarkers = getAccountMarkers(existingStats);
      const incomingMarkers = getAccountMarkers(incomingStats);
      const marker = pickComparableMarker(existingMarkers, incomingMarkers);
      if (!marker) {
        return res.status(400).json({ error: 'Cannot verify account for this link. Create a new shared link.' });
      }
      if (existingMarkers[marker] !== incomingMarkers[marker]) {
        return res.status(409).json({ error: 'Account mismatch. This link belongs to another Spotify account.' });
      }
    }

    const blob = await put(`spotify-stats/${id}.json`, JSON.stringify(req.body), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });

    res.status(200).json({
      id,
      blobUrl: blob.url,
      canResolveById: !!process.env.BLOB_STORE_BASE_URL,
      updated: isUpdate,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
};
