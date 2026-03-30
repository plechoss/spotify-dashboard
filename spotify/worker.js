// Spotify Streaming History Processor — Web Worker
// Receives: { files: [{ name: string, buffer: ArrayBuffer }, ...] }
// Posts:    { type: 'progress', step: string, done: number, total: number }
//           { type: 'done', stats: object, history: array }
//           { type: 'error', message: string }

self.onmessage = function(e) {
  try { process(e.data.files); }
  catch(err) { self.postMessage({ type: 'error', message: err.message }); }
};

function simplifyPlatform(raw) {
  const p = (raw || '').toLowerCase();
  if (/ios|iphone|ipad/.test(p))      return 'iOS';
  if (p.includes('android'))           return 'Android';
  if (/os x|macos|osx/.test(p))       return 'macOS';
  if (/windows|win32/.test(p))         return 'Windows';
  if (p.includes('linux'))             return 'Linux';
  if (p.includes('web'))               return 'Web Player';
  if (p.includes('cast'))              return 'Chromecast';
  if (/ps4|ps5|playstation/.test(p))  return 'PlayStation';
  return 'Other';
}

function process(files) {
  // Only audio history files
  const audioFiles = files
    .filter(f => f.name.includes('Streaming_History_Audio_'))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!audioFiles.length) {
    throw new Error('No Streaming_History_Audio_*.json files found. Select files from your Spotify data export.');
  }

  const dec = new TextDecoder();
  const music = [], podcasts = [];
  const total = audioFiles.length;

  // ── Parse all files ──────────────────────────────────────────────────────────
  for (let i = 0; i < total; i++) {
    self.postMessage({ type: 'progress', step: 'Parsing ' + audioFiles[i].name, done: i, total });
    const entries = JSON.parse(dec.decode(audioFiles[i].buffer));
    for (const e of entries) {
      if (e.master_metadata_track_name) music.push(e);
      else if (e.episode_name)          podcasts.push(e);
    }
  }

  self.postMessage({ type: 'progress', step: 'Sorting ' + music.length.toLocaleString() + ' plays…', done: total, total });
  music.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  self.postMessage({ type: 'progress', step: 'Computing overview…', done: total, total });

  // ── Overview ─────────────────────────────────────────────────────────────────
  let totalMs = 0;
  const uArtists = new Set(), uSongs = new Set(), uAlbums = new Set(), dates = new Set();

  for (const p of music) {
    totalMs += p.ms_played;
    const a = p.master_metadata_album_artist_name || '';
    const t = p.master_metadata_track_name        || '';
    const al = p.master_metadata_album_album_name || '';
    const d = p.ts.slice(0, 10);
    if (a)      uArtists.add(a);
    if (a && t)  uSongs.add(a + '\x00' + t);
    if (a && al) uAlbums.add(a + '\x00' + al);
    dates.add(d);
  }

  const datesSorted = [...dates].sort();
  const d1Str = datesSorted[0], d2Str = datesSorted[datesSorted.length - 1];
  const d1 = new Date(d1Str + 'T00:00:00Z');
  const d2 = new Date(d2Str + 'T00:00:00Z');
  const spanDays = Math.round((d2 - d1) / 86400000) + 1;

  // Streak
  let streak = 0, maxStreak = 0;
  for (let dt = new Date(d1); dt <= d2; dt = new Date(dt.getTime() + 86400000)) {
    if (dates.has(dt.toISOString().slice(0, 10))) { streak++; maxStreak = Math.max(maxStreak, streak); }
    else streak = 0;
  }

  // Busiest day
  const dayMs = new Map();
  for (const p of music) {
    const d = p.ts.slice(0, 10);
    dayMs.set(d, (dayMs.get(d) || 0) + p.ms_played);
  }
  let busiestDay = '', busiestMs = 0;
  for (const [d, ms] of dayMs) { if (ms > busiestMs) { busiestMs = ms; busiestDay = d; } }

  const totalPlays = music.length;
  const skipC    = music.filter(p => p.skipped    || p.ms_played < 30000).length;
  const shuffleC = music.filter(p => p.shuffle).length;
  const offlineC = music.filter(p => p.offline).length;

  const overview = {
    total_ms: totalMs, total_plays: totalPlays,
    unique_artists: uArtists.size, unique_songs: uSongs.size, unique_albums: uAlbums.size,
    first_play: d1Str, last_play: d2Str,
    active_days: dates.size, span_days: spanDays, longest_streak: maxStreak,
    skip_rate:    totalPlays ? Math.round(skipC    / totalPlays * 1e4) / 1e4 : 0,
    shuffle_rate: totalPlays ? Math.round(shuffleC / totalPlays * 1e4) / 1e4 : 0,
    offline_rate: totalPlays ? Math.round(offlineC / totalPlays * 1e4) / 1e4 : 0,
    busiest_day: busiestDay, busiest_day_ms: busiestMs,
  };

  self.postMessage({ type: 'progress', step: 'Ranking artists, songs & albums…', done: total, total });

  // ── Top Artists ──────────────────────────────────────────────────────────────
  const aMs = new Map(), aPl = new Map(), aFirst = new Map();
  for (const p of music) {
    const a = p.master_metadata_album_artist_name; if (!a) continue;
    aMs.set(a, (aMs.get(a) || 0) + p.ms_played);
    aPl.set(a, (aPl.get(a) || 0) + 1);
    const d = p.ts.slice(0, 10);
    if (!aFirst.has(a) || d < aFirst.get(a)) aFirst.set(a, d);
  }
  const topArtists = [...aMs.entries()].sort((a,b) => b[1]-a[1]).slice(0, 100)
    .map(([name, ms]) => ({ name, ms, plays: aPl.get(name), first_heard: aFirst.get(name) }));

  // ── Top Songs ────────────────────────────────────────────────────────────────
  const sMs = new Map(), sPl = new Map(), sAl = new Map(), sSk = new Map();
  for (const p of music) {
    const a = p.master_metadata_album_artist_name || '';
    const t = p.master_metadata_track_name        || '';
    if (!a || !t) continue;
    const k = a + '\x00' + t;
    sMs.set(k, (sMs.get(k) || 0) + p.ms_played);
    sPl.set(k, (sPl.get(k) || 0) + 1);
    if (p.skipped || p.ms_played < 30000) sSk.set(k, (sSk.get(k) || 0) + 1);
    if (!sAl.has(k)) sAl.set(k, p.master_metadata_album_album_name || '');
  }
  const topSongs = [...sMs.entries()].sort((a,b) => b[1]-a[1]).slice(0, 200)
    .map(([k, ms]) => {
      const [artist, name] = k.split('\x00');
      return { artist, name, album: sAl.get(k) || '', ms, plays: sPl.get(k) };
    });
  const topSkippedSongs = [...sSk.entries()]
    .sort((a,b) =>
      b[1] - a[1] ||
      (sPl.get(b[0]) || 0) - (sPl.get(a[0]) || 0) ||
      (sMs.get(b[0]) || 0) - (sMs.get(a[0]) || 0)
    )
    .slice(0, 100)
    .map(([k, skipCount]) => {
      const [artist, name] = k.split('\x00');
      const plays = sPl.get(k) || 0;
      return {
        artist,
        name,
        album: sAl.get(k) || '',
        skip_count: skipCount,
        plays,
        skip_rate: plays ? Math.round(skipCount / plays * 1e4) / 1e4 : 0,
      };
    });

  // ── Top Albums ───────────────────────────────────────────────────────────────
  const alMs = new Map(), alPl = new Map();
  for (const p of music) {
    const a  = p.master_metadata_album_artist_name || '';
    const al = p.master_metadata_album_album_name  || '';
    if (!a || !al) continue;
    const k = a + '\x00' + al;
    alMs.set(k, (alMs.get(k) || 0) + p.ms_played);
    alPl.set(k, (alPl.get(k) || 0) + 1);
  }
  const topAlbums = [...alMs.entries()].sort((a,b) => b[1]-a[1]).slice(0, 100)
    .map(([k, ms]) => { const [artist, name] = k.split('\x00'); return { artist, name, ms, plays: alPl.get(k) }; });

  self.postMessage({ type: 'progress', step: 'Computing timeline & habits…', done: total, total });

  // ── Monthly ──────────────────────────────────────────────────────────────────
  const mMs = new Map(), mPl = new Map();
  for (const p of music) {
    const m = p.ts.slice(0, 7);
    mMs.set(m, (mMs.get(m) || 0) + p.ms_played);
    mPl.set(m, (mPl.get(m) || 0) + 1);
  }
  const byMonth = [...mMs.keys()].sort().map(m => ({ month: m, ms: mMs.get(m), plays: mPl.get(m) }));

  // ── Yearly (with per-year top 10) ────────────────────────────────────────────
  const yMs = new Map(), yPl = new Map();
  const yArt = new Map(), ySongs = new Map();
  const yAms = new Map(), yApl = new Map();
  const ySms = new Map(), ySpl = new Map(), ySal = new Map();
  const yAlms = new Map(), yAlpl = new Map();
  const yPodMs = new Map(), yPodEp = new Map(); // year -> Map(show -> ms/episodes)

  for (const p of podcasts) {
    const y = p.ts.slice(0, 4);
    const s = p.episode_show_name || 'Unknown';
    if (!yPodMs.has(y)) yPodMs.set(y, new Map());
    yPodMs.get(y).set(s, (yPodMs.get(y).get(s) || 0) + p.ms_played);
    if (!yPodEp.has(y)) yPodEp.set(y, new Map());
    yPodEp.get(y).set(s, (yPodEp.get(y).get(s) || 0) + 1);
  }

  for (const p of music) {
    const y  = p.ts.slice(0, 4);
    const a  = p.master_metadata_album_artist_name || '';
    const t  = p.master_metadata_track_name        || '';
    const al = p.master_metadata_album_album_name  || '';
    const ms = p.ms_played;

    yMs.set(y, (yMs.get(y) || 0) + ms);
    yPl.set(y, (yPl.get(y) || 0) + 1);

    if (a) {
      if (!yArt.has(y)) yArt.set(y, new Set());
      yArt.get(y).add(a);
      if (!yAms.has(y)) yAms.set(y, new Map());
      yAms.get(y).set(a, (yAms.get(y).get(a) || 0) + ms);
      if (!yApl.has(y)) yApl.set(y, new Map());
      yApl.get(y).set(a, (yApl.get(y).get(a) || 0) + 1);
    }
    if (a && t) {
      const sk = a + '\x00' + t;
      if (!ySongs.has(y)) ySongs.set(y, new Set());
      ySongs.get(y).add(sk);
      if (!ySms.has(y)) ySms.set(y, new Map());
      ySms.get(y).set(sk, (ySms.get(y).get(sk) || 0) + ms);
      if (!ySpl.has(y)) ySpl.set(y, new Map());
      ySpl.get(y).set(sk, (ySpl.get(y).get(sk) || 0) + 1);
      if (!ySal.has(y)) ySal.set(y, new Map());
      if (!ySal.get(y).has(sk)) ySal.get(y).set(sk, al);
    }
    if (a && al) {
      const ak = a + '\x00' + al;
      if (!yAlms.has(y)) yAlms.set(y, new Map());
      yAlms.get(y).set(ak, (yAlms.get(y).get(ak) || 0) + ms);
      if (!yAlpl.has(y)) yAlpl.set(y, new Map());
      yAlpl.get(y).set(ak, (yAlpl.get(y).get(ak) || 0) + 1);
    }
  }

  const byYear = {};
  for (const y of [...yMs.keys()].sort()) {
    const ams = yAms.get(y) || new Map(), apl = yApl.get(y) || new Map();
    const sms = ySms.get(y) || new Map(), spl = ySpl.get(y) || new Map(), sal = ySal.get(y) || new Map();
    const alms = yAlms.get(y) || new Map(), alpl = yAlpl.get(y) || new Map();
    const topA  = [...ams.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
    const topS  = [...sms.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
    const topAl = [...alms.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
    byYear[y] = {
      ms: yMs.get(y), plays: yPl.get(y),
      unique_artists: (yArt.get(y) || new Set()).size,
      unique_songs: (ySongs.get(y) || new Set()).size,
      top_artist: topA.length ? topA[0][0] : null,
      top_artists: topA.map(([name,ms]) => ({ name, ms, plays: apl.get(name) })),
      top_songs:   topS.map(([k,ms]) => { const [artist,name]=k.split('\x00'); return { artist, name, album: sal.get(k)||'', ms, plays: spl.get(k) }; }),
      top_albums:  topAl.map(([k,ms]) => { const [artist,name]=k.split('\x00'); return { artist, name, ms, plays: alpl.get(k) }; }),
      top_podcasts: [...(yPodMs.get(y) || new Map()).entries()].sort((a,b)=>b[1]-a[1]).slice(0,10)
        .map(([name,ms]) => ({ name, ms, episodes: (yPodEp.get(y)||new Map()).get(name) })),
    };
  }

  // ── Hour / Weekday ───────────────────────────────────────────────────────────
  const hPl = new Array(24).fill(0), hMs = new Array(24).fill(0);
  const wPl = new Array(7).fill(0),  wMs = new Array(7).fill(0);
  for (const p of music) {
    const hour = parseInt(p.ts.slice(11, 13), 10);
    if (hour >= 0 && hour < 24) { hPl[hour]++; hMs[hour] += p.ms_played; }
    // getUTCDay: Sun=0…Sat=6 → Python Mon=0…Sun=6: (dow+6)%7
    const dow = new Date(p.ts).getUTCDay();
    const pythonDow = (dow + 6) % 7;
    wPl[pythonDow]++; wMs[pythonDow] += p.ms_played;
  }

  // ── Platforms & Countries ────────────────────────────────────────────────────
  const plMs = new Map(), plPl = new Map(), coMs = new Map(), coPl = new Map();
  for (const p of music) {
    const pl = simplifyPlatform(p.platform);
    plMs.set(pl, (plMs.get(pl)||0) + p.ms_played); plPl.set(pl, (plPl.get(pl)||0) + 1);
    const c = p.conn_country || '??';
    coMs.set(c, (coMs.get(c)||0) + p.ms_played);   coPl.set(c, (coPl.get(c)||0) + 1);
  }
  const platforms = {};
  for (const [k,ms] of [...plMs.entries()].sort((a,b)=>b[1]-a[1])) platforms[k] = { ms, plays: plPl.get(k) };
  const countries = [...coMs.entries()].sort((a,b)=>b[1]-a[1]).slice(0,50)
    .map(([code,ms]) => ({ code, ms, plays: coPl.get(code) }));

  // ── Podcasts ─────────────────────────────────────────────────────────────────
  const shMs = new Map(), shEp = new Map();
  for (const p of podcasts) {
    const s = p.episode_show_name || 'Unknown';
    shMs.set(s, (shMs.get(s)||0) + p.ms_played); shEp.set(s, (shEp.get(s)||0) + 1);
  }
  const topPodcasts = [...shMs.entries()].sort((a,b)=>b[1]-a[1]).slice(0,50)
    .map(([name,ms]) => ({ name, ms, episodes: shEp.get(name) }));

  self.postMessage({ type: 'progress', step: 'Building history index…', done: total, total });

  // ── History (compact, most recent first) ─────────────────────────────────────
  const history = [];
  for (let i = music.length - 1; i >= 0; i--) {
    const p = music[i];
    history.push([
      p.ts.slice(0, 16),
      p.master_metadata_album_artist_name || '',
      p.master_metadata_track_name        || '',
      p.master_metadata_album_album_name  || '',
      p.ms_played,
      (p.skipped || p.ms_played < 30000) ? 1 : 0,
    ]);
  }

  const stats = {
    overview, top_artists: topArtists, top_songs: topSongs, top_albums: topAlbums,
    top_skipped_songs: topSkippedSongs,
    by_month: byMonth, by_year: byYear,
    by_hour: { plays: hPl, ms: hMs }, by_weekday: { plays: wPl, ms: wMs },
    platforms, countries, top_podcasts: topPodcasts,
    podcast_overview: {
      total_ms: podcasts.reduce((s,p)=>s+p.ms_played,0),
      total_plays: podcasts.length,
      unique_shows: shMs.size,
    },
  };

  self.postMessage({ type: 'done', stats, history });
}
