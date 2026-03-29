import os
from dotenv import load_dotenv
import spotipy
from spotipy.oauth2 import SpotifyOAuth

load_dotenv()

sp = spotipy.Spotify(auth_manager=SpotifyOAuth(
    client_id=os.getenv("SPOTIPY_CLIENT_ID"),
    client_secret=os.getenv("SPOTIPY_CLIENT_SECRET"),
    redirect_uri=os.getenv("SPOTIPY_REDIRECT_URI"),
    scope="user-top-read",
))

TIME_RANGES = {
    "short_term": "Last 4 weeks",
    "medium_term": "Last 6 months",
    "long_term": "All time",
}

for time_range, label in TIME_RANGES.items():
    print(f"\n--- Your top artists: {label} ---")
    results = sp.current_user_top_artists(limit=10, time_range=time_range)
    for i, artist in enumerate(results["items"], 1):
        genres = ", ".join(artist.get("genres", [])[:3]) or "no genres listed"
        print(f"  {i:2}. {artist['name']} ({genres})")
