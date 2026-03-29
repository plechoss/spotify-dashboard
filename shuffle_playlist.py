import os
import random
from dotenv import load_dotenv
import spotipy
from spotipy.oauth2 import SpotifyOAuth

load_dotenv()

sp = spotipy.Spotify(auth_manager=SpotifyOAuth(
    client_id=os.getenv("SPOTIPY_CLIENT_ID"),
    client_secret=os.getenv("SPOTIPY_CLIENT_SECRET"),
    redirect_uri=os.getenv("SPOTIPY_REDIRECT_URI"),
    scope="playlist-read-private playlist-modify-public playlist-modify-private",
))

# Find the playlist
playlists = sp.current_user_playlists()
playlist = None
while playlists:
    for p in playlists["items"]:
        if p["name"] == "Ślub w tle":
            playlist = p
            break
    if playlist or not playlists["next"]:
        break
    playlists = sp.next(playlists)

if not playlist:
    print("Playlist 'Slub w tle' not found.")
    exit(1)

playlist_id = playlist["id"]
print(f"Found: {playlist['name']}")

# Fetch all track URIs
uris = []
results = sp.playlist_items(playlist_id, fields="items(track(uri)),next")
while results:
    for item in results["items"]:
        if item.get("track") and item["track"].get("uri"):
            uris.append(item["track"]["uri"])
    if results["next"]:
        results = sp.next(results)
    else:
        break

# Safety check
if not uris:
    print("No tracks found — aborting to avoid wiping the playlist.")
    exit(1)

# Shuffle
random.shuffle(uris)

# Replace playlist contents with shuffled tracks (100 at a time)
sp.playlist_replace_items(playlist_id, uris[:100])
for i in range(100, len(uris), 100):
    sp.playlist_add_items(playlist_id, uris[i:i+100])

print(f"Shuffled {len(uris)} tracks.")
