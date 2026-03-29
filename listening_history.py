import os
from dotenv import load_dotenv
import spotipy
from spotipy.oauth2 import SpotifyOAuth

load_dotenv()

sp = spotipy.Spotify(auth_manager=SpotifyOAuth(
    client_id=os.getenv("SPOTIPY_CLIENT_ID"),
    client_secret=os.getenv("SPOTIPY_CLIENT_SECRET"),
    redirect_uri=os.getenv("SPOTIPY_REDIRECT_URI"),
    scope="user-read-recently-played",
))

results = sp.current_user_recently_played(limit=50)
print("Last 50 played tracks:\n")
for i, item in enumerate(results["items"], 1):
    track = item["track"]
    artist = track["artists"][0]["name"]
    played_at = item["played_at"][:16].replace("T", " ")
    print(f"  {i:2}. {artist} — {track['name']} ({played_at})")
