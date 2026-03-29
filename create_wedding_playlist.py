import os
from dotenv import load_dotenv
import spotipy
from spotipy.oauth2 import SpotifyOAuth

load_dotenv()

sp = spotipy.Spotify(auth_manager=SpotifyOAuth(
    client_id=os.getenv("SPOTIPY_CLIENT_ID"),
    client_secret=os.getenv("SPOTIPY_CLIENT_SECRET"),
    redirect_uri=os.getenv("SPOTIPY_REDIRECT_URI"),
    scope="user-top-read playlist-modify-public playlist-modify-private",
))

SONGS = [
    ("Daft Punk", "Get Lucky"),
    ("Daft Punk", "Instant Crush"),
    ("Daft Punk", "Something About Us"),
    ("Daft Punk", "Lose Yourself to Dance"),
    ("Daft Punk", "Digital Love"),
    ("Fontaines D.C.", "Televised Mind"),
    ("Fontaines D.C.", "Roman Holiday"),
    ("Fontaines D.C.", "Jackie Down the Line"),
    ("Fontaines D.C.", "Nabokov"),
    ("Fontaines D.C.", "I Love You"),
    ("JPEGMAFIA", "BANANA!"),
    ("JPEGMAFIA", "BALD!"),
    ("JPEGMAFIA", "Hand Habits"),
    ("JPEGMAFIA", "Rebound!"),
    ("JPEGMAFIA", "POST OFFICE BUDDY!"),
    ("Oasis", "Champagne Supernova"),
    ("Oasis", "Whatever"),
    ("Oasis", "Talk Tonight"),
    ("Oasis", "Half the World Away"),
    ("Oasis", "The Masterplan"),
    ("Beastie Boys", "Sure Shot"),
    ("Beastie Boys", "Intergalactic"),
    ("Beastie Boys", "Fight for Your Right"),
    ("Beastie Boys", "So What'cha Want"),
    ("Beastie Boys", "Sabotage"),
    ("Kendrick Lamar", "LOVE."),
    ("Kendrick Lamar", "Poetic Justice"),
    ("Kendrick Lamar", "Money Trees"),
    ("Kendrick Lamar", "These Walls"),
    ("Kendrick Lamar", "Father Time"),
    ("Danny Brown", "Pneumonia"),
    ("Danny Brown", "Ain't It Funny"),
    ("Danny Brown", "When It Rain"),
    ("Danny Brown", "Dirty Laundry"),
    ("Danny Brown", "25 Bucks"),
    ("Radiohead", "Creep"),
    ("Radiohead", "No Surprises"),
    ("Radiohead", "High and Dry"),
    ("Radiohead", "Karma Police"),
    ("Radiohead", "Nude"),
    ("David Bowie", "Golden Years"),
    ("David Bowie", "Heroes"),
    ("David Bowie", "Let's Dance"),
    ("David Bowie", "Modern Love"),
    ("David Bowie", "Starman"),
    ("The Beatles", "Here Comes the Sun"),
    ("The Beatles", "All You Need Is Love"),
    ("The Beatles", "Ob-La-Di, Ob-La-Da"),
    ("The Beatles", "In My Life"),
    ("The Beatles", "Twist and Shout"),
]

playlist = sp.current_user_playlist_create("claude wedding playlist", public=False)
print(f"Created playlist: {playlist['external_urls']['spotify']}")

track_uris = []
not_found = []

for artist, title in SONGS:
    query = f"track:{title} artist:{artist}"
    results = sp.search(q=query, type="track", limit=1)
    tracks = results["tracks"]["items"]
    if tracks:
        track_uris.append(tracks[0]["uri"])
        print(f"  found: {artist} - {title}")
    else:
        not_found.append(f"{artist} - {title}")
        print(f"  NOT FOUND: {artist} - {title}")

sp.playlist_add_items(playlist["id"], track_uris)
print(f"\nAdded {len(track_uris)} tracks to the playlist.")

if not_found:
    print(f"\nCould not find {len(not_found)} tracks:")
    for t in not_found:
        print(f"  - {t}")
