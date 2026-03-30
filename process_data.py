#!/usr/bin/env python3
"""
Spotify Extended Streaming History → Web Dashboard
Run: python3 process_data.py
"""
import json, glob, os, http.server, socketserver, webbrowser, threading
from collections import defaultdict
from datetime import datetime, timedelta

DATA_DIR = "Spotify Extended Streaming History"
OUT_DIR  = "spotify/data"
PORT     = 8888

def simplify_platform(raw):
    p = (raw or "").lower()
    if any(x in p for x in ("ios", "iphone", "ipad")):       return "iOS"
    if "android" in p:                                         return "Android"
    if any(x in p for x in ("os x", "macos", "osx")):        return "macOS"
    if any(x in p for x in ("windows", "win32")):             return "Windows"
    if "linux" in p:                                           return "Linux"
    if "web" in p:                                             return "Web Player"
    if "cast" in p:                                            return "Chromecast"
    if any(x in p for x in ("ps4", "ps5", "playstation")):   return "PlayStation"
    return "Other"

def load_plays():
    plays = []
    for f in sorted(glob.glob(f"{DATA_DIR}/Streaming_History_Audio_*.json")):
        with open(f, encoding="utf-8") as fp:
            plays.extend(json.load(fp))
    music    = [p for p in plays if p.get("master_metadata_track_name")]
    podcasts = [p for p in plays if p.get("episode_name")]
    music.sort(key=lambda x: x["ts"])
    return music, podcasts

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("⏳  Loading streaming history…")
    music, podcasts = load_plays()
    print(f"    {len(music):,} music plays  |  {len(podcasts):,} podcast plays")

    # ── Overview ────────────────────────────────────────────────────────────
    total_ms    = sum(p["ms_played"] for p in music)
    total_plays = len(music)

    u_artists = set(); u_songs = set(); u_albums = set(); dates = set()
    for p in music:
        a  = p.get("master_metadata_album_artist_name") or ""
        t  = p.get("master_metadata_track_name")        or ""
        al = p.get("master_metadata_album_album_name")  or ""
        d  = p["ts"][:10]
        if a:        u_artists.add(a)
        if a and t:  u_songs.add((a, t))
        if a and al: u_albums.add((a, al))
        dates.add(d)

    dates_s = sorted(dates)
    d1 = datetime.fromisoformat(dates_s[0])
    d2 = datetime.fromisoformat(dates_s[-1])
    span = (d2 - d1).days + 1

    # longest streak
    streak = max_streak = 0
    cur = d1
    while cur <= d2:
        if cur.strftime("%Y-%m-%d") in dates:
            streak += 1; max_streak = max(max_streak, streak)
        else:
            streak = 0
        cur += timedelta(days=1)

    day_ms = defaultdict(int)
    for p in music:
        day_ms[p["ts"][:10]] += p["ms_played"]
    busiest = max(day_ms, key=day_ms.get)

    skip_c    = sum(1 for p in music if p.get("skipped") or p["ms_played"] < 30_000)
    shuffle_c = sum(1 for p in music if p.get("shuffle"))
    offline_c = sum(1 for p in music if p.get("offline"))

    overview = dict(
        total_ms=total_ms,   total_plays=total_plays,
        unique_artists=len(u_artists), unique_songs=len(u_songs),
        unique_albums=len(u_albums),
        first_play=dates_s[0], last_play=dates_s[-1],
        active_days=len(dates), span_days=span,
        longest_streak=max_streak,
        skip_rate=round(skip_c / total_plays, 4)    if total_plays else 0,
        shuffle_rate=round(shuffle_c / total_plays, 4) if total_plays else 0,
        offline_rate=round(offline_c / total_plays, 4) if total_plays else 0,
        busiest_day=busiest, busiest_day_ms=day_ms[busiest],
    )
    print(f"    Total listening: {total_ms // 3_600_000:,}h  ({total_ms // 86_400_000:,} full days)")

    # ── Top Artists ─────────────────────────────────────────────────────────
    a_ms = defaultdict(int); a_pl = defaultdict(int); a_first = {}
    for p in music:
        a = p.get("master_metadata_album_artist_name")
        if not a: continue
        a_ms[a] += p["ms_played"]; a_pl[a] += 1
        d = p["ts"][:10]
        if a not in a_first or d < a_first[a]: a_first[a] = d

    top_artists = [
        {"name": a, "ms": a_ms[a], "plays": a_pl[a], "first_heard": a_first[a]}
        for a in sorted(a_ms, key=a_ms.get, reverse=True)[:100]
    ]

    # ── Top Songs ────────────────────────────────────────────────────────────
    s_ms = defaultdict(int); s_pl = defaultdict(int); s_al = {}; s_sk = defaultdict(int)
    for p in music:
        a = p.get("master_metadata_album_artist_name") or ""
        t = p.get("master_metadata_track_name")        or ""
        if not (a and t): continue
        k = (a, t); s_ms[k] += p["ms_played"]; s_pl[k] += 1
        if p.get("skipped") or p["ms_played"] < 30_000: s_sk[k] += 1
        if k not in s_al: s_al[k] = p.get("master_metadata_album_album_name") or ""

    top_songs = [
        {"artist": k[0], "name": k[1], "album": s_al.get(k, ""),
         "ms": s_ms[k], "plays": s_pl[k]}
        for k in sorted(s_ms, key=s_ms.get, reverse=True)[:200]
    ]
    top_skipped_songs = [
        {"artist": k[0], "name": k[1], "album": s_al.get(k, ""),
         "skip_count": s_sk[k], "plays": s_pl[k],
         "skip_rate": round(s_sk[k] / s_pl[k], 4) if s_pl[k] else 0}
        for k in sorted(s_sk, key=lambda kk: (s_sk[kk], s_pl[kk], s_ms[kk]), reverse=True)[:100]
    ]

    # ── Top Albums ───────────────────────────────────────────────────────────
    al_ms = defaultdict(int); al_pl = defaultdict(int)
    for p in music:
        a  = p.get("master_metadata_album_artist_name") or ""
        al = p.get("master_metadata_album_album_name")  or ""
        if not (a and al): continue
        k = (a, al); al_ms[k] += p["ms_played"]; al_pl[k] += 1

    top_albums = [
        {"artist": k[0], "name": k[1], "ms": al_ms[k], "plays": al_pl[k]}
        for k in sorted(al_ms, key=al_ms.get, reverse=True)[:100]
    ]

    # ── Monthly / Yearly ─────────────────────────────────────────────────────
    m_ms = defaultdict(int); m_pl = defaultdict(int)
    for p in music:
        m = p["ts"][:7]; m_ms[m] += p["ms_played"]; m_pl[m] += 1
    by_month = [{"month": m, "ms": m_ms[m], "plays": m_pl[m]} for m in sorted(m_ms)]

    y_ms   = defaultdict(int); y_pl    = defaultdict(int)
    y_art  = defaultdict(set); y_songs = defaultdict(set)
    y_ams  = defaultdict(lambda: defaultdict(int))
    y_apl  = defaultdict(lambda: defaultdict(int))
    y_sms  = defaultdict(lambda: defaultdict(int))
    y_spl  = defaultdict(lambda: defaultdict(int))
    y_sal  = defaultdict(dict)
    y_alms = defaultdict(lambda: defaultdict(int))
    y_alpl = defaultdict(lambda: defaultdict(int))
    y_pod_ms = defaultdict(lambda: defaultdict(int))
    y_pod_ep = defaultdict(lambda: defaultdict(int))
    for p in podcasts:
        y = p["ts"][:4]; s = p.get("episode_show_name") or "Unknown"
        y_pod_ms[y][s] += p["ms_played"]; y_pod_ep[y][s] += 1
    for p in music:
        y  = p["ts"][:4]
        a  = p.get("master_metadata_album_artist_name") or ""
        t  = p.get("master_metadata_track_name")        or ""
        al = p.get("master_metadata_album_album_name")  or ""
        ms = p["ms_played"]
        y_ms[y] += ms; y_pl[y] += 1
        if a:
            y_art[y].add(a)
            y_ams[y][a] += ms; y_apl[y][a] += 1
        if a and t:
            k = (a, t)
            y_songs[y].add(k)
            y_sms[y][k] += ms; y_spl[y][k] += 1
            if k not in y_sal[y]: y_sal[y][k] = al
        if a and al:
            k2 = (a, al)
            y_alms[y][k2] += ms; y_alpl[y][k2] += 1

    by_year = {}
    for y in sorted(y_ms):
        top_a = sorted(y_ams[y], key=y_ams[y].get, reverse=True)[:10]
        top_s = sorted(y_sms[y], key=y_sms[y].get, reverse=True)[:10]
        top_al = sorted(y_alms[y], key=y_alms[y].get, reverse=True)[:10]
        by_year[y] = {
            "ms": y_ms[y], "plays": y_pl[y],
            "unique_artists": len(y_art[y]), "unique_songs": len(y_songs[y]),
            "top_artist": max(y_ams[y], key=y_ams[y].get) if y_ams[y] else None,
            "top_artists": [{"name": a, "ms": y_ams[y][a], "plays": y_apl[y][a]} for a in top_a],
            "top_songs":   [{"artist": k[0], "name": k[1], "album": y_sal[y].get(k,""),
                              "ms": y_sms[y][k], "plays": y_spl[y][k]} for k in top_s],
            "top_albums":  [{"artist": k[0], "name": k[1],
                              "ms": y_alms[y][k], "plays": y_alpl[y][k]} for k in top_al],
            "top_podcasts": [{"name": s, "ms": y_pod_ms[y][s], "episodes": y_pod_ep[y][s]}
                             for s in sorted(y_pod_ms[y], key=y_pod_ms[y].get, reverse=True)[:10]],
        }

    # ── Temporal Patterns ────────────────────────────────────────────────────
    h_pl = [0]*24; h_ms = [0]*24; w_pl = [0]*7; w_ms = [0]*7
    for p in music:
        try:
            dt = datetime.fromisoformat(p["ts"].replace("Z", "+00:00"))
            h_pl[dt.hour] += 1;       h_ms[dt.hour]       += p["ms_played"]
            w_pl[dt.weekday()] += 1;  w_ms[dt.weekday()]  += p["ms_played"]
        except Exception:
            pass

    # ── Platforms & Countries ────────────────────────────────────────────────
    pl_ms = defaultdict(int); pl_pl = defaultdict(int)
    co_ms = defaultdict(int); co_pl = defaultdict(int)
    for p in music:
        pl = simplify_platform(p.get("platform"))
        pl_ms[pl] += p["ms_played"]; pl_pl[pl] += 1
        c  = p.get("conn_country") or "??"
        co_ms[c] += p["ms_played"]; co_pl[c] += 1

    platforms = {k: {"ms": pl_ms[k], "plays": pl_pl[k]}
                 for k in sorted(pl_ms, key=pl_ms.get, reverse=True)}
    countries = sorted(
        [{"code": c, "ms": co_ms[c], "plays": co_pl[c]} for c in co_ms],
        key=lambda x: x["ms"], reverse=True)[:50]

    # ── Podcasts ─────────────────────────────────────────────────────────────
    sh_ms = defaultdict(int); sh_ep = defaultdict(int)
    for p in podcasts:
        s = p.get("episode_show_name") or "Unknown"
        sh_ms[s] += p["ms_played"]; sh_ep[s] += 1

    top_podcasts = [
        {"name": s, "ms": sh_ms[s], "episodes": sh_ep[s]}
        for s in sorted(sh_ms, key=sh_ms.get, reverse=True)[:50]
    ]

    # ── Write stats.json ─────────────────────────────────────────────────────
    stats = dict(
        overview=overview, top_artists=top_artists,
        top_songs=top_songs, top_albums=top_albums,
        top_skipped_songs=top_skipped_songs,
        by_month=by_month, by_year=by_year,
        by_hour={"plays": h_pl, "ms": h_ms},
        by_weekday={"plays": w_pl, "ms": w_ms},
        platforms=platforms, countries=countries,
        top_podcasts=top_podcasts,
        podcast_overview={
            "total_ms": sum(p["ms_played"] for p in podcasts),
            "total_plays": len(podcasts),
            "unique_shows": len(sh_ms),
        }
    )
    with open(f"{OUT_DIR}/stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False)
    print(f"    ✓  stats.json")

    # ── Write history.json (compact) ─────────────────────────────────────────
    # Each row: [ts, artist, song, album, ms_played, skipped]
    hist = [
        [p["ts"][:16],
         p.get("master_metadata_album_artist_name") or "",
         p.get("master_metadata_track_name")        or "",
         p.get("master_metadata_album_album_name")  or "",
         p["ms_played"],
         1 if (p.get("skipped") or p["ms_played"] < 30_000) else 0]
        for p in reversed(music)  # most recent first
    ]
    with open(f"{OUT_DIR}/history.json", "w", encoding="utf-8") as f:
        json.dump(hist, f, ensure_ascii=False, separators=(",", ":"))
    size_mb = os.path.getsize(f"{OUT_DIR}/history.json") / 1_048_576
    print(f"    ✓  history.json  ({len(hist):,} entries, {size_mb:.1f} MB)")

    # ── Serve ────────────────────────────────────────────────────────────────
    os.chdir("spotify")
    Handler = http.server.SimpleHTTPRequestHandler
    Handler.log_message = lambda *a: None  # silence access log

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"\n🎵  Dashboard ready →  {url}\n    Press Ctrl+C to stop.\n")
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
        httpd.serve_forever()

if __name__ == "__main__":
    main()
