import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

async function getSpotifyAppToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Spotify application credentials exchange failed with status ${res.status}. Response body:`, errorText);
      return null;
    }
    const data: any = await res.json();
    return data.access_token || null;
  } catch (err) {
    console.error("Error getting Spotify app token:", err);
    return null;
  }
}

function getRedirectUri(req: express.Request, port: number): string {
  let hostUrl = "";
  if (process.env.APP_URL && process.env.APP_URL !== "MY_APP_URL") {
    hostUrl = process.env.APP_URL.trim().replace(/\/$/, "");
  } else {
    const hostHeader = req.headers.host || `localhost:${port}`;
    const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
    hostUrl = `${isHttps ? "https" : "http"}://${hostHeader}`;
  }
  return `${hostUrl}/api/spotify/callback`;
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function encodeSpotifySearch(query: string): string {
  return encodeURIComponent(query).replace(/'/g, "%27");
}

const LOCAL_CATALOG: Record<string, any[]> = {
  "the beatles": [
    { title: "Here Comes The Sun", album: "Abbey Road", releaseYear: "1969", duration: "3:06", durationSeconds: 186, popularity: 88, id: "6789i", uri: "spotify:track:66DF69b9148d48", href: "https://open.spotify.com/track/66DF69b9148d48", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Yesterday", album: "Help!", releaseYear: "1965", duration: "2:05", durationSeconds: 125, popularity: 78, id: "5581w", uri: "spotify:track:5581w", href: "https://open.spotify.com/track/5581w", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1548778052-311f4bc2b502?w=300" },
    { title: "Come Together", album: "Abbey Road", releaseYear: "1969", duration: "4:19", durationSeconds: 259, popularity: 81, id: "2284o", uri: "spotify:track:2284o", href: "https://open.spotify.com/track/2284o", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300" },
    { title: "Let It Be", album: "Let It Be", releaseYear: "1970", duration: "4:03", durationSeconds: 243, popularity: 83, id: "7741p", uri: "spotify:track:7741p", href: "https://open.spotify.com/track/7741p", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300" }
  ],
  "daft punk": [
    { title: "Get Lucky", album: "Random Access Memories", releaseYear: "2013", duration: "6:09", durationSeconds: 369, popularity: 82, id: "2F98a", uri: "spotify:track:2F98a", href: "https://open.spotify.com/track/2F98a", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300" },
    { title: "One More Time", album: "Discovery", releaseYear: "2000", duration: "5:20", durationSeconds: 320, popularity: 78, id: "1MoTe", uri: "spotify:track:1MoTe", href: "https://open.spotify.com/track/1MoTe", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300" },
    { title: "Harder, Better, Faster, Stronger", album: "Discovery", releaseYear: "2001", duration: "3:44", durationSeconds: 224, popularity: 79, id: "5HaBe", uri: "spotify:track:5HaBe", href: "https://open.spotify.com/track/5HaBe", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300" },
    { title: "Instant Crush", album: "Random Access Memories", releaseYear: "2013", duration: "5:37", durationSeconds: 337, popularity: 80, id: "3IsCr", uri: "spotify:track:3IsCr", href: "https://open.spotify.com/track/3IsCr", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300" }
  ],
  "taylor swift": [
    { title: "Blank Space", album: "1989", releaseYear: "2014", duration: "3:51", durationSeconds: 231, popularity: 87, id: "4BSpc", uri: "spotify:track:4BSpc", href: "https://open.spotify.com/track/4BSpc", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Cruel Summer", album: "Lover", releaseYear: "2019", duration: "2:58", durationSeconds: 178, popularity: 94, id: "3CrSu", uri: "spotify:track:3CrSu", href: "https://open.spotify.com/track/3CrSu", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Anti-Hero", album: "Midnights", releaseYear: "2022", duration: "3:20", durationSeconds: 200, popularity: 85, id: "5AnHe", uri: "spotify:track:5AnHe", href: "https://open.spotify.com/track/5AnHe", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Love Story", album: "Fearless", releaseYear: "2008", duration: "3:55", durationSeconds: 235, popularity: 81, id: "6LoSt", uri: "spotify:track:6LoSt", href: "https://open.spotify.com/track/6LoSt", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "drake": [
    { title: "One Dance", album: "Views", releaseYear: "2016", duration: "2:53", durationSeconds: 173, popularity: 88, id: "6OnDa", uri: "spotify:track:6OnDa", href: "https://open.spotify.com/track/6OnDa", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "God's Plan", album: "Scorpion", releaseYear: "2018", duration: "3:18", durationSeconds: 198, popularity: 86, id: "1GoPl", uri: "spotify:track:1GoPl", href: "https://open.spotify.com/track/1GoPl", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Hotline Bling", album: "Views", releaseYear: "2015", duration: "4:27", durationSeconds: 267, popularity: 80, id: "2HoBl", uri: "spotify:track:2HoBl", href: "https://open.spotify.com/track/2HoBl", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Passionfruit", album: "More Life", releaseYear: "2017", duration: "4:58", durationSeconds: 298, popularity: 84, id: "3PaFr", uri: "spotify:track:3PaFr", href: "https://open.spotify.com/track/3PaFr", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "billie eilish": [
    { title: "Bad Guy", album: "When We All Fall Asleep", releaseYear: "2019", duration: "3:14", durationSeconds: 194, popularity: 84, id: "1BaGy", uri: "spotify:track:1BaGy", href: "https://open.spotify.com/track/1BaGy", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Everything I Wanted", album: "Everything I Wanted", releaseYear: "2019", duration: "4:05", durationSeconds: 245, popularity: 82, id: "2EvWa", uri: "spotify:track:2EvWa", href: "https://open.spotify.com/track/2EvWa", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Lovely", album: "Lovely", releaseYear: "2018", duration: "3:20", durationSeconds: 200, popularity: 88, id: "3LoVe", uri: "spotify:track:3LoVe", href: "https://open.spotify.com/track/3LoVe", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Ocean Eyes", album: "Don't Smile at Me", releaseYear: "2016", duration: "3:20", durationSeconds: 200, popularity: 81, id: "4OcEy", uri: "spotify:track:4OcEy", href: "https://open.spotify.com/track/4OcEy", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "kendrick lamar": [
    { title: "Humble", album: "Damn", releaseYear: "2017", duration: "2:57", durationSeconds: 177, popularity: 83, id: "1HuMb", uri: "spotify:track:1HuMb", href: "https://open.spotify.com/track/1HuMb", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Money Trees", album: "Good Kid, M.A.A.D City", releaseYear: "2012", duration: "6:26", durationSeconds: 386, popularity: 84, id: "2MoTr", uri: "spotify:track:2MoTr", href: "https://open.spotify.com/track/2MoTr", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Alright", album: "To Pimp a Butterfly", releaseYear: "2015", duration: "3:39", durationSeconds: 219, popularity: 74, id: "3AlRi", uri: "spotify:track:3AlRi", href: "https://open.spotify.com/track/3AlRi", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "DNA", album: "Damn", releaseYear: "2017", duration: "3:05", durationSeconds: 185, popularity: 75, id: "4DNaA", uri: "spotify:track:4DNaA", href: "https://open.spotify.com/track/4DNaA", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "pink floyd": [
    { title: "Another Brick in the Wall", album: "The Wall", releaseYear: "1979", duration: "3:59", durationSeconds: 239, popularity: 77, id: "1AnBr", uri: "spotify:track:1AnBr", href: "https://open.spotify.com/track/1AnBr", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Wish You Were Here", album: "Wish You Were Here", releaseYear: "1975", duration: "5:34", durationSeconds: 334, popularity: 79, id: "2WiYo", uri: "spotify:track:2WiYo", href: "https://open.spotify.com/track/2WiYo", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Money", album: "The Dark Side of the Moon", releaseYear: "1973", duration: "6:22", durationSeconds: 382, popularity: 74, id: "3MoNe", uri: "spotify:track:3MoNe", href: "https://open.spotify.com/track/3MoNe", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Comfortably Numb", album: "The Wall", releaseYear: "1979", duration: "6:22", durationSeconds: 382, popularity: 78, id: "4CoNu", uri: "spotify:track:4CoNu", href: "https://open.spotify.com/track/4CoNu", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "hans zimmer": [
    { title: "Time", album: "Inception OST", releaseYear: "2010", duration: "4:35", durationSeconds: 275, popularity: 77, id: "1TiMe", uri: "spotify:track:1TiMe", href: "https://open.spotify.com/track/1TiMe", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Cornfield Chase", album: "Interstellar OST", releaseYear: "2014", duration: "2:06", durationSeconds: 126, popularity: 80, id: "2CoCh", uri: "spotify:track:2CoCh", href: "https://open.spotify.com/track/2CoCh", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "He's a Pirate", album: "Pirates of the Caribbean", releaseYear: "2003", duration: "1:30", durationSeconds: 90, popularity: 71, id: "3HePi", uri: "spotify:track:3HePi", href: "https://open.spotify.com/track/3HePi", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Theme from Gladiator", album: "Gladiator OST", releaseYear: "2000", duration: "4:00", durationSeconds: 240, popularity: 65, id: "4GlAd", uri: "spotify:track:4GlAd", href: "https://open.spotify.com/track/4GlAd", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "queen": [
    { title: "Bohemian Rhapsody", album: "A Night at the Opera", releaseYear: "1975", duration: "5:55", durationSeconds: 355, popularity: 84, id: "1BoRh", uri: "spotify:track:1BoRh", href: "https://open.spotify.com/track/1BoRh", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Don't Stop Me Now", album: "Jazz", releaseYear: "1978", duration: "3:29", durationSeconds: 209, popularity: 82, id: "2DoSt", uri: "spotify:track:2DoSt", href: "https://open.spotify.com/track/2DoSt", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Another One Bites the Dust", album: "The Game", releaseYear: "1980", duration: "3:35", durationSeconds: 215, popularity: 83, id: "3AnBi", uri: "spotify:track:3AnBi", href: "https://open.spotify.com/track/3AnBi", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Under Pressure", album: "Hot Space", releaseYear: "1982", duration: "4:08", durationSeconds: 248, popularity: 79, id: "4UnPr", uri: "spotify:track:4UnPr", href: "https://open.spotify.com/track/4UnPr", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "abba": [
    { title: "Dancing Queen", album: "Arrival", releaseYear: "1976", duration: "3:51", durationSeconds: 231, popularity: 84, id: "1DaQu", uri: "spotify:track:1DaQu", href: "https://open.spotify.com/track/1DaQu", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Mamma Mia", album: "ABBA", releaseYear: "1975", duration: "3:32", durationSeconds: 212, popularity: 77, id: "2MaMi", uri: "spotify:track:2MaMi", href: "https://open.spotify.com/track/2MaMi", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Gimme! Gimme! Gimme!", album: "Voulez-Vous", releaseYear: "1979", duration: "4:52", durationSeconds: 292, popularity: 82, id: "3GiGi", uri: "spotify:track:3GiGi", href: "https://open.spotify.com/track/3GiGi", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "The Winner Takes It All", album: "Super Trouper", releaseYear: "1980", duration: "4:56", durationSeconds: 296, popularity: 75, id: "4WiTa", uri: "spotify:track:4WiTa", href: "https://open.spotify.com/track/4WiTa", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "metallica": [
    { title: "Enter Sandman", album: "Metallica", releaseYear: "1991", duration: "5:31", durationSeconds: 331, popularity: 81, id: "1EnSa", uri: "spotify:track:1EnSa", href: "https://open.spotify.com/track/1EnSa", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Nothing Else Matters", album: "Metallica", releaseYear: "1991", duration: "6:28", durationSeconds: 388, popularity: 81, id: "2NoEl", uri: "spotify:track:2NoEl", href: "https://open.spotify.com/track/2NoEl", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Master of Puppets", album: "Master of Puppets", releaseYear: "1986", duration: "8:35", durationSeconds: 515, popularity: 75, id: "3MaPu", uri: "spotify:track:3MaPu", href: "https://open.spotify.com/track/3MaPu", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "One", album: "...And Justice for All", releaseYear: "1988", duration: "7:27", durationSeconds: 447, popularity: 73, id: "4OnE1", uri: "spotify:track:4OnE1", href: "https://open.spotify.com/track/4OnE1", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "gorillaz": [
    { title: "Feel Good Inc.", album: "Demon Days", releaseYear: "2005", duration: "3:41", durationSeconds: 221, popularity: 82, id: "1FeGo", uri: "spotify:track:1FeGo", href: "https://open.spotify.com/track/1FeGo", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Clint Eastwood", album: "Gorillaz", releaseYear: "2001", duration: "5:40", durationSeconds: 340, popularity: 77, id: "2ClEa", uri: "spotify:track:2ClEa", href: "https://open.spotify.com/track/2ClEa", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "On Melancholy Hill", album: "Plastic Beach", releaseYear: "2010", duration: "3:53", durationSeconds: 233, popularity: 75, id: "3OnMe", uri: "spotify:track:3OnMe", href: "https://open.spotify.com/track/3OnMe", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Rhinestone Eyes", album: "Plastic Beach", releaseYear: "2010", duration: "3:20", durationSeconds: 200, popularity: 74, id: "4RhEy", uri: "spotify:track:4RhEy", href: "https://open.spotify.com/track/4RhEy", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "dua lipa": [
    { title: "Levitating", album: "Future Nostalgia", releaseYear: "2020", duration: "3:23", durationSeconds: 203, popularity: 80, id: "1LeVi", uri: "spotify:track:1LeVi", href: "https://open.spotify.com/track/1LeVi", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Don't Start Now", album: "Future Nostalgia", releaseYear: "2019", duration: "3:03", durationSeconds: 183, popularity: 81, id: "2DoStN", uri: "spotify:track:2DoStN", href: "https://open.spotify.com/track/2DoStN", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "New Rules", album: "Dua Lipa", releaseYear: "2017", duration: "3:29", durationSeconds: 209, popularity: 76, id: "3NeRu", uri: "spotify:track:3NeRu", href: "https://open.spotify.com/track/3NeRu", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Houdini", album: "Radical Optimism", releaseYear: "2024", duration: "3:05", durationSeconds: 185, popularity: 78, id: "4HoUd", uri: "spotify:track:4HoUd", href: "https://open.spotify.com/track/4HoUd", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "fleetwood mac": [
    { title: "Dreams", album: "Rumours", releaseYear: "1977", duration: "4:17", durationSeconds: 257, popularity: 86, id: "1DrEa", uri: "spotify:track:1DrEa", href: "https://open.spotify.com/track/1DrEa", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Go Your Own Way", album: "Rumours", releaseYear: "1977", duration: "3:38", durationSeconds: 218, popularity: 82, id: "2GoYo", uri: "spotify:track:2GoYo", href: "https://open.spotify.com/track/2GoYo", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "The Chain", album: "Rumours", releaseYear: "1977", duration: "4:28", durationSeconds: 268, popularity: 82, id: "3ThCh", uri: "spotify:track:3ThCh", href: "https://open.spotify.com/track/3ThCh", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Landslide", album: "Fleetwood Mac", releaseYear: "1975", duration: "3:19", durationSeconds: 199, popularity: 78, id: "4LaSi", uri: "spotify:track:4LaSi", href: "https://open.spotify.com/track/4LaSi", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "bruno mars": [
    { title: "Locked Out of Heaven", album: "Unorthodox Jukebox", releaseYear: "2012", duration: "3:53", durationSeconds: 233, popularity: 84, id: "1LoOu", uri: "spotify:track:1LoOu", href: "https://open.spotify.com/track/1LoOu", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Just the Way You Are", album: "Doo-Wops & Hooligans", releaseYear: "2010", duration: "3:40", durationSeconds: 220, popularity: 82, id: "2JuWa", uri: "spotify:track:2JuWa", href: "https://open.spotify.com/track/2JuWa", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Uptown Funk", album: "Uptown Special", releaseYear: "2014", duration: "4:30", durationSeconds: 270, popularity: 84, id: "3UpFu", uri: "spotify:track:3UpFu", href: "https://open.spotify.com/track/3UpFu", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "24K Magic", album: "24K Magic", releaseYear: "2016", duration: "3:47", durationSeconds: 227, popularity: 78, id: "4T24K", uri: "spotify:track:4T24K", href: "https://open.spotify.com/track/4T24K", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "coldplay": [
    { title: "Yellow", album: "Parachutes", releaseYear: "2000", duration: "4:29", durationSeconds: 269, popularity: 88, id: "1YeLl", uri: "spotify:track:1YeLl", href: "https://open.spotify.com/track/1YeLl", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Viva La Vida", album: "Viva la Vida", releaseYear: "2008", duration: "4:02", durationSeconds: 242, popularity: 87, id: "2ViLa", uri: "spotify:track:2ViLa", href: "https://open.spotify.com/track/2ViLa", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "The Scientist", album: "A Rush of Blood to the Head", releaseYear: "2002", duration: "5:09", durationSeconds: 309, popularity: 84, id: "3ScIe", uri: "spotify:track:3ScIe", href: "https://open.spotify.com/track/3ScIe", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Fix You", album: "X&Y", releaseYear: "2005", duration: "4:54", durationSeconds: 294, popularity: 83, id: "4FiYo", uri: "spotify:track:4FiYo", href: "https://open.spotify.com/track/4FiYo", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "eminem": [
    { title: "Lose Yourself", album: "8 Mile OST", releaseYear: "2002", duration: "5:26", durationSeconds: 326, popularity: 84, id: "1LoYo", uri: "spotify:track:1LoYo", href: "https://open.spotify.com/track/1LoYo", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Without Me", album: "The Eminem Show", releaseYear: "2002", duration: "4:50", durationSeconds: 290, popularity: 85, id: "2WiMe", uri: "spotify:track:2WiMe", href: "https://open.spotify.com/track/2WiMe", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "The Real Slim Shady", album: "The Marshall Mathers LP", releaseYear: "2000", duration: "4:44", durationSeconds: 284, popularity: 81, id: "3SlSh", uri: "spotify:track:3SlSh", href: "https://open.spotify.com/track/3SlSh", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Mockingbird", album: "Encore", releaseYear: "2004", duration: "4:11", durationSeconds: 251, popularity: 82, id: "4MoBi", uri: "spotify:track:4MoBi", href: "https://open.spotify.com/track/4MoBi", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "olivia rodrigo": [
    { title: "Drivers License", album: "Sour", releaseYear: "2021", duration: "4:02", durationSeconds: 242, popularity: 83, id: "1DrLi", uri: "spotify:track:1DrLi", href: "https://open.spotify.com/track/1DrLi", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Good 4 U", album: "Sour", releaseYear: "2021", duration: "2:58", durationSeconds: 178, popularity: 82, id: "2Go4U", uri: "spotify:track:2Go4U", href: "https://open.spotify.com/track/2Go4U", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Vampire", album: "Guts", releaseYear: "2023", duration: "3:59", durationSeconds: 239, popularity: 84, id: "3VaMp", uri: "spotify:track:3VaMp", href: "https://open.spotify.com/track/3VaMp", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Deja Vu", album: "Sour", releaseYear: "2021", duration: "3:35", durationSeconds: 215, popularity: 79, id: "4DeVu", uri: "spotify:track:4DeVu", href: "https://open.spotify.com/track/4DeVu", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "michael jackson": [
    { title: "Billie Jean", album: "Thriller", releaseYear: "1982", duration: "4:54", durationSeconds: 294, popularity: 84, id: "1BiJe", uri: "spotify:track:1BiJe", href: "https://open.spotify.com/track/1BiJe", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Thriller", album: "Thriller", releaseYear: "1982", duration: "5:57", durationSeconds: 357, popularity: 77, id: "2ThRi", uri: "spotify:track:2ThRi", href: "https://open.spotify.com/track/2ThRi", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Beat It", album: "Thriller", releaseYear: "1982", duration: "4:18", durationSeconds: 258, popularity: 80, id: "3BeIt", uri: "spotify:track:3BeIt", href: "https://open.spotify.com/track/3BeIt", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Smooth Criminal", album: "Bad", releaseYear: "1987", duration: "4:17", durationSeconds: 257, popularity: 81, id: "4SmCr", uri: "spotify:track:4SmCr", href: "https://open.spotify.com/track/4SmCr", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ],
  "radiohead": [
    { title: "Creep", album: "Pablo Honey", releaseYear: "1993", duration: "3:58", durationSeconds: 238, popularity: 84, id: "1CrEe", uri: "spotify:track:1CrEe", href: "https://open.spotify.com/track/1CrEe", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "Karma Police", album: "OK Computer", releaseYear: "1997", duration: "4:21", durationSeconds: 261, popularity: 78, id: "2KaPo", uri: "spotify:track:2KaPo", href: "https://open.spotify.com/track/2KaPo", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "No Surprises", album: "OK Computer", releaseYear: "1997", duration: "3:49", durationSeconds: 229, popularity: 79, id: "3NoSu", uri: "spotify:track:3NoSu", href: "https://open.spotify.com/track/3NoSu", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" },
    { title: "High and Dry", album: "The Bends", releaseYear: "1995", duration: "4:17", durationSeconds: 257, popularity: 73, id: "4HiDr", uri: "spotify:track:4HiDr", href: "https://open.spotify.com/track/4HiDr", previewUrl: null, albumCover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300" }
  ]
};

function generateProgrammaticFact(artistName: string, trackName: string, albumName: string, releaseYear: string, popularity: number): string {
  const templates = [
    `An outstanding hit by ${artistName} from the acclaimed album '${albumName}' (${releaseYear}).`,
    `This brilliant track by ${artistName} is one of the most celebrated highlights from the album '${albumName}'.`,
    `A signature masterpiece by ${artistName} that remains a fan-favorite since debuting in ${releaseYear}.`,
    `Features some of the most memorable hooks and artistic production of ${artistName}'s discography.`,
    `Representing the peak creative era of ${artistName}, from the landmark release '${albumName}'.`
  ];
  let hash = 0;
  const combined = `${artistName}-${trackName}`;
  for (let i = 0; i < combined.length; i++) {
    hash = combined.charCodeAt(i) + ((hash << 5) - hash);
  }
  return templates[Math.abs(hash) % templates.length];
}

function generateProgrammaticPlaylistMetadata(artists: string[], vibe: string): { playlistTitle: string, playlistDescription: string } {
  const vibePrefixes: Record<string, string> = {
    default: "Golden",
    chill: "Lush & Chill",
    energy: "High Energy",
    moody: "Nocturnal",
    classic: "Iconic & Rare"
  };
  const vibeAdjectives: Record<string, string> = {
    default: "unfiltered tracks and raw musical acclaim",
    chill: "soft tempos, gentle acoustic elements, and relaxed grooves",
    energy: "heavy rhythms, high beats per minute, and intense focus-driving masterworks",
    moody: "deeply atmospheric, late-night emotional hooks, and cozy resonance",
    classic: "timeless songs, legendary melodies, and deeply influential historic gems"
  };

  const selectedVibe = vibe || "default";
  const prefix = vibePrefixes[selectedVibe] || "Custom";
  const adject = vibeAdjectives[selectedVibe] || "custom dynamic curation";

  let title = "";
  if (artists.length <= 3) {
    title = `${artists.join(" x ")}: ${prefix} Blend`;
  } else {
    title = `${artists.slice(0, 2).join(" & ")} & Friends: ${prefix} Mix`;
  }

  const description = `A masterfully compiled compilation of ${artists.join(", ")}, specifically tuned to highlight ${adject}. Programmatically selected using direct Spotify catalogs and release indexes on a real-time blend matrix. Action elements are fully synced and ready to play.`;

  return { playlistTitle: title, playlistDescription: description };
}

interface FetchFallbackResult {
  ok: boolean;
  status: number;
  data: any;
  source: "global" | "user" | null;
  errorBody?: string;
}

async function spotifyFetchWithFallback(
  url: string,
  appToken: string | null,
  userAccessToken: string | null = null,
  addLog?: (level: "info" | "warn" | "error" | "success", message: string) => void,
  checkEmptyItems: boolean = false
): Promise<FetchFallbackResult> {
  const log = addLog || ((level: string, message: string) => console.log(`[SPOTIFY_FALLBACK] [${level.toUpperCase()}] ${message}`));
  
  const tokensToTry: Array<{ token: string; type: "global" | "user" }> = [];
  if (appToken) {
    tokensToTry.push({ token: appToken, type: "global" });
  }
  if (userAccessToken) {
    tokensToTry.push({ token: userAccessToken, type: "user" });
  }

  if (tokensToTry.length === 0) {
    return { ok: false, status: 401, data: null, source: null, errorBody: "No Spotify access tokens available (neither app-wide nor user session)." };
  }

  let finalStatus = 200;
  let finalError = "";
  
  for (const { token, type } of tokensToTry) {
    const label = type === "global" ? "Global Session (MA Client ID)" : "User Developer Session";
    log("info", `Executing Spotify Web API request [${label}] to: ${url}`);
    
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Accept": "application/json"
        }
      });
      
      finalStatus = res.status;
      const resText = await res.text();
      
      if (res.ok) {
        let resData: any = null;
        try {
          resData = JSON.parse(resText);
        } catch (e) {
          log("warn", `Spotify response was OK but could not be parsed as JSON. Content preview: ${resText.slice(0, 200)}`);
          continue;
        }
        
        if (checkEmptyItems && url.includes("/v1/search")) {
          const itemsCount = resData.tracks?.items?.length || resData.artists?.items?.length || 0;
          if (itemsCount === 0) {
            log("warn", `Spotify [${label}] returned empty search items list. Proceeding to fallback token...`);
            finalError = "Empty search results";
            continue;
          }
        }
        
        log("success", `Spotify [${label}] call succeeded! URL: ${url}`);
        return { ok: true, status: res.status, data: resData, source: type };
      } else {
        log("error", `Spotify Web API call failed [${label}] - Status ${res.status}. Error body: ${resText}`);
        finalError = resText;
      }
    } catch (err: any) {
      log("error", `Exception during Spotify Web API fetch [${label}] to ${url}: ${err.message}`);
      finalError = err.message;
    }
  }
  
  return { ok: false, status: finalStatus, data: null, source: null, errorBody: finalError };
}

const app = express();
const PORT = 3000;

app.use(express.json());

// API Route - Get Config
app.get("/api/spotify/config", (req, res) => {
    res.json({
      configured: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
      clientId: process.env.SPOTIFY_CLIENT_ID || "",
      redirectUri: getRedirectUri(req, PORT),
    });
  });

  // API Route - Generate Playlist (hybrid curation engine using Spotify metadata + Gemini AI)
  app.post("/api/generate-playlist", async (req: express.Request, res: express.Response) => {
    const { artists, vibePreference, vibeId, spotifyRankingOnly, userAccessToken } = req.body;
    const songsPerArtist = Math.max(1, Math.min(10, parseInt(req.body.songsPerArtist) || 4));
    const logs: Array<{ timestamp: string; level: string; message: string }> = [];

    const getFormattedTime = () => {
      return new Date().toISOString().split("T")[1].slice(0, 8);
    };

    const addLog = (level: "info" | "warn" | "error" | "success", message: string) => {
      const timestamp = getFormattedTime();
      logs.push({ timestamp, level, message });
      console.log(`[GEN_CANDIDATE] [${level.toUpperCase()}] ${message}`);
    };

    if (!Array.isArray(artists) || artists.length < 1 || artists.length > 10) {
      addLog("error", "Received invalid artist selection parameters.");
      return res.status(400).json({ error: "Please select between 1 and 10 artists." });
    }

    addLog("info", `Initiated custom blend compilation request for selected artists: ${artists.join(", ")}`);
    addLog("info", `Desired songs per artist: ${songsPerArtist}`);
    addLog("info", `User aesthetic mood directives: "${vibePreference || 'none'}"`);

    const isSpotifyRanking = !!spotifyRankingOnly;

    // Verify Gemini API Key availability (unless pure Spotify Ranking is checked)
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!isSpotifyRanking && !geminiKey) {
      addLog("error", "GEMINI_API_KEY is not defined in the environment. Please configure it in Settings.");
      return res.status(400).json({
        error: "Gemini API key is not configured. Please add GEMINI_API_KEY to AI Studio Settings > Secrets to enable curation.",
        logs
      });
    }

    try {
      addLog("info", "Checking Spotify Developer application client configuration...");
      const clientId = process.env.SPOTIFY_CLIENT_ID;
      const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        if (!clientId) addLog("error", "SPOTIFY_CLIENT_ID configuration is missing in server environment.");
        if (!clientSecret) addLog("error", "SPOTIFY_CLIENT_SECRET configuration is missing in server environment.");
        
        return res.status(400).json({
          error: "Spotify Developer credentials (Client ID / Client Secret) are not fully configured. Please configure them in AI Studio Settings.",
          logs
        });
      }

      addLog("info", "Requesting application access bearer token from Spotify Accounts service...");
      const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      
      let appToken: string | null = null;
      try {
        const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: {
            Authorization: `Basic ${creds}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "grant_type=client_credentials",
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          addLog("error", `Spotify credentials exchange rejected (HTTP status ${tokenRes.status}). Response: ${errText}`);
          return res.status(401).json({
            error: `Spotify client credential exchange rejected with status ${tokenRes.status}. Make sure your Client ID and Client Secret are active and matches your Spotify Developer account.`,
            logs
          });
        }

        const tokenData: any = await tokenRes.json();
        appToken = tokenData.access_token || null;
        if (appToken) {
          addLog("success", `Successfully authorized Spotify Web API! Token received.`);
        } else {
          addLog("error", "Received empty access_token field from Spotify auth payload.");
          return res.status(500).json({
            error: "Spotify account authorized successfully, but returned an empty access token.",
            logs
          });
        }
      } catch (authEndpointErr: any) {
        addLog("error", `Network connector exception to accounts.spotify.com: ${authEndpointErr.message}`);
        return res.status(500).json({
          error: `Could not reach Spotify authorization servers. Network error: ${authEndpointErr.message}`,
          logs
        });
      }

      interface ResolvedArtist {
        originalName: string;
        actualName: string;
        genres: string[];
        avatarPlaceholderColor: string;
        rawTracks: any[];
      }

      const resolvedArtists: ResolvedArtist[] = [];

      // Loop over artists, resolve their details and fetch a large tracklist from Spotify Catalog
      for (const artistName of artists) {
        addLog("info", `Searching Spotify Catalog profile for: "${artistName}"`);
        try {
          let actualArtistName = artistName;
          let genres = ["Universal Curation"];

          // Resolve Artist Profile
          let artistItem: any = null;
          const isSpotifyId = artistName.startsWith("spotify:artist:") || /^[a-zA-Z0-9]{22}$/.test(artistName);

          if (isSpotifyId) {
            const id = artistName.startsWith("spotify:artist:") ? artistName.split(":")[2] : artistName;
            const getUrl = `https://api.spotify.com/v1/artists/${id}`;
            addLog("info", `Requesting Spotify Artist profile directly by ID: ${id}`);
            const getRes = await spotifyFetchWithFallback(getUrl, appToken, userAccessToken, addLog, false);
            if (getRes.ok && getRes.data) {
              artistItem = getRes.data;
            }
          }

          if (!artistItem) {
            const searchQuery = `artist:"${artistName}"`;
            const searchQueryEncoded = encodeSpotifySearch(searchQuery);
            const searchUrl = `https://api.spotify.com/v1/search?q=${searchQueryEncoded}&type=artist&limit=5`;
            addLog("info", `Requesting Spotify Artist profile search URL: ${searchUrl}`);
            
            const searchRes = await spotifyFetchWithFallback(searchUrl, appToken, userAccessToken, addLog, true);
            if (searchRes.ok && searchRes.data?.artists?.items) {
              const items = searchRes.data.artists.items;
              // First look for exact match (case-insensitive) in the returned items
              artistItem = items.find(
                (item: any) => item && item.name && item.name.toLowerCase().trim() === artistName.toLowerCase().trim()
              ) || items[0];
            }

            if (!artistItem) {
              // Retry with open filter if strict query fails
              const searchUrlFallback = `https://api.spotify.com/v1/search?q=${encodeSpotifySearch(artistName)}&type=artist&limit=5`;
              addLog("warn", `Profile strictly matched empty for "${artistName}". Attempting open query fallback to URL: ${searchUrlFallback}...`);
              const searchFallbackRes = await spotifyFetchWithFallback(searchUrlFallback, appToken, userAccessToken, addLog, true);
              if (searchFallbackRes.ok && searchFallbackRes.data?.artists?.items) {
                const items = searchFallbackRes.data.artists.items;
                // First look for exact match (case-insensitive) in the fallback items
                artistItem = items.find(
                  (item: any) => item && item.name && item.name.toLowerCase().trim() === artistName.toLowerCase().trim()
                ) || items[0];
              }
            }
          }

          if (!artistItem) {
            addLog("warn", `Could not find any profiles matching "${artistName}" on Spotify. Skipping/removing from list.`);
            continue;
          }

          actualArtistName = artistItem.name;
          if (Array.isArray(artistItem.genres) && artistItem.genres.length > 0) {
            genres = artistItem.genres.slice(0, 3);
          }

          addLog("success", `Resolved profile: "${actualArtistName}"`);

          // Fetch tracks pool from Spotify Catalog (requesting up to 10 popular tracks)
          const cleanArtistQuery = `artist:"${actualArtistName}"`;
          const trackSearchUrl = `https://api.spotify.com/v1/search?q=${encodeSpotifySearch(cleanArtistQuery)}&type=track&limit=10&market=CA&use_global_session=True`;
          
          const tokenToUse = userAccessToken || appToken;
          const tokenLabel = userAccessToken ? "user token session" : "global app session (fallback)";
          
          addLog("info", `Requesting Spotify Catalog tracks URL utilizing ${tokenLabel}: ${trackSearchUrl}`);
          let rawTracksList: any[] = [];
          try {
            const trRes = await fetch(trackSearchUrl, {
              headers: {
                Authorization: `Bearer ${tokenToUse}`,
                "Accept": "application/json"
              }
            });
            if (trRes.ok) {
              const trData: any = await trRes.json();
              rawTracksList = trData.tracks?.items || [];
              addLog("success", `Direct track search succeeded and found ${rawTracksList.length} tracks using ${tokenLabel}.`);
            } else {
              const errBody = await trRes.text();
              addLog("error", `Spotify track search failed with status ${trRes.status}. Error: ${errBody}`);
            }
          } catch (err: any) {
            addLog("error", `Exception during Spotify track search: ${err.message}`);
          }

          if (rawTracksList.length === 0) {
            addLog("warn", `Zero tracks found for artist "${actualArtistName}". Skipping/removing from list.`);
            continue;
          }

          addLog("success", `Recovered ${rawTracksList.length} possible tracks from search pool.`);

          let hash = 0;
          for (let i = 0; i < actualArtistName.length; i++) {
            hash = actualArtistName.charCodeAt(i) + ((hash << 5) - hash);
          }
          const hexColors = ["#1E1B4B", "#115E59", "#111827", "#1E3A8A", "#311042", "#064E3B", "#3F1616", "#1C1917"];
          const avatarPlaceholderColor = hexColors[Math.abs(hash) % hexColors.length];

          resolvedArtists.push({
            originalName: artistName,
            actualName: actualArtistName,
            genres,
            avatarPlaceholderColor,
            rawTracks: rawTracksList
          });

        } catch (innerArtistErr: any) {
          addLog("warn", `Failed while resolving "${artistName}": ${innerArtistErr.message}. Skipping/removing from list.`);
          continue;
        }
      }

      // Check if we solved any valid artists
      if (resolvedArtists.length === 0) {
        addLog("error", "No artists could be resolved on Spotify. Curation aborted.");
        return res.status(404).json({
          error: "None of your selected artists could be found or active on empty catalog lookups. Please double check the artist names.",
          logs
        });
      }

      // Handle raw Spotify Popularity Ranking Only mode (Bypassing Gemini completely)
      if (isSpotifyRanking) {
        addLog("info", "Bypassing Gemini curation since 'Spotify Ranking Only' is active.");
        addLog("info", "Extracting tracks straight from Spotify Catalog...");

        const firstTwoNames = resolvedArtists.slice(0, 2).map((ra) => ra.actualName).join(" & ");
        const finalTitle = `${firstTwoNames}${resolvedArtists.length > 2 ? " + More" : ""}`.slice(0, 30);
        const allNames = resolvedArtists.map((ra) => ra.actualName).join(", ");
        const finalDescription = `Featured track selections for ${allNames}. Real-time metadata blend, no AI filters.`;

        const spotifySelectedArtistsData: any[] = [];

        for (const resolvedArt of resolvedArtists) {
          addLog("info", `Gathering first 10 tracks returned from Spotify for "${resolvedArt.actualName}"...`);
          const rawPool = resolvedArt.rawTracks.slice(0, 10);
          
          // Map tracks to pair them with their original 1-based Spotify ranking index
          const tracksWithOriginalRank = rawPool.map((rt: any, idx: number) => ({
            rt,
            originalRank: idx + 1
          }));

          addLog("info", `Randomly selecting ${songsPerArtist} track(s) from the pool of ${rawPool.length} tracks...`);
          const shuffledPool = shuffleArray(tracksWithOriginalRank);
          const selectedTracks = shuffledPool.slice(0, songsPerArtist);

          const mappedSongsList = selectedTracks.map(({ rt, originalRank }) => {
            let durationStr = "3:45";
            let durationSec = 225;
            if (rt.duration_ms) {
              durationSec = Math.floor(rt.duration_ms / 1000);
              const mins = Math.floor(durationSec / 60);
              const secs = durationSec % 60;
              durationStr = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
            }

            return {
              title: rt.name,
              album: rt.album?.name || "Single",
              releaseYear: (rt.album?.release_date || "").split("-")[0] || "2020",
              duration: durationStr,
              durationSeconds: durationSec,
              spotifySearchQuery: `${resolvedArt.actualName} - ${rt.name}`,
              popularity: rt.popularity || 50,
              rankingOrdinal: originalRank,
              id: rt.id,
              uri: rt.uri,
              href: rt.external_urls?.spotify || `https://open.spotify.com/search/${encodeURIComponent(resolvedArt.actualName + " - " + rt.name)}`,
              previewUrl: rt.preview_url,
              albumCover: (rt.album?.images?.[0]?.url || rt.album?.images?.[1]?.url || ""),
              fact: "" // No song blurb/fact for a spotify only playlist
            };
          });

          spotifySelectedArtistsData.push({
            name: resolvedArt.actualName,
            genres: resolvedArt.genres,
            avatarPlaceholderColor: resolvedArt.avatarPlaceholderColor,
            songs: mappedSongsList
          });
        }

        addLog("success", "Spotify direct track selection complete! Returning compiled blend...");
        return res.json({
          playlistTitle: finalTitle,
          playlistDescription: finalDescription,
          artists: spotifySelectedArtistsData,
          logs
        });
      }

      // Step 3: Initialize GoogleGenAI client & query Gemini for the curated blend
      addLog("info", "Initializing Gemini curation model...");
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      // Construct a summary list of retrieved actual tracks from Spotify for Gemini context
      const artistProfilesContext = resolvedArtists.map((ra) => {
        const trackSummaries = ra.rawTracks.slice(0, 30).map((t) => `- "${t.name}" on album "${t.album?.name || 'Single'}" (${(t.album?.release_date || '').slice(0, 4) || 'Unknown'})`).join("\n");
        return `Artist Name: "${ra.actualName}"\nResolved Tracks Pool:\n${trackSummaries}`;
      }).join("\n\n");

      const targetSongsCount = vibeId === "default" ? 15 : songsPerArtist;

      const geminiPrompt = `
You are an expert, highly knowledgeable music curator with deep, detailed trivia knowledge of bands, singers, albums, and songs.
We are building a highly cohesive, professional collaborative blend playlist for the following artists: ${resolvedArtists.map((ra) => ra.actualName).join(", ")}.
We want this playlist to adhere carefully to the following aesthetic vibe/mood: "${vibePreference || 'Default Pop/Rock Masterpieces'}".

For each resolved artist, here are the track records we found for them on the Spotify Music Catalog:
${artistProfilesContext}

Your curating tasks are:
1. Playlist metadata:
   - Create a beautiful, creative playlist name. Important rule: MAXIMUM 30 characters.
   - Write a cohesive, compelling, and descriptive summary/bio for this playlist (MAXIMUM 300 characters). Highlight how these artists fuse under the requested vibe criteria.
2. Curation list per artist:
   - For each artist, curate EXACTLY ${targetSongsCount} of their most iconic, popular, and essential tracks.
   - Order them from #1 (most iconic/popular/essential under this specific vibe) down to #${targetSongsCount}.
   - Prefer newer songs slightly if they fit the requested vibe elegantly, but maintain the overall prestige level of the track.
   - Try to favor track titles from the provided Spotify search pool context above to maximize matching, but feel free to suggest other iconic masterpieces if they are genuinely the artist's legendary songs.
   - For each song, assign rankingOrdinal (integer from 1 to ${targetSongsCount} inside the artist's list).
   - Write a highly fascinating, fun, true, and educational fact or trivia about each track under 100 characters (e.g., songwriting secrets, chart awards, production notes, or culture loops). Do NOT use generic text like "Classic track by..." or "Released in YYYY".

Return a single JSON object strictly matching this schema:
{
  "playlistTitle": "The playlist name (max 30 chars)",
  "playlistDescription": "The playlist description (max 300 chars)",
  "artists": [
    {
      "artistName": "Exact Resolved Artist Name matching the context input",
      "songs": [
        {
          "title": "Exact Title of Song",
          "album": "Album name",
          "releaseYear": "YYYY",
          "rankingOrdinal": 1,
          "fact": "Fascinating trivia string"
        }
      ]
    }
  ]
}
`;

      addLog("info", "Sending curation prompt to Gemini 3.5 Flash model...");
      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: geminiPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              playlistTitle: {
                type: Type.STRING,
                description: "Name of the playlist. Maximum 30 characters."
              },
              playlistDescription: {
                type: Type.STRING,
                description: "Cohesive playlist summary. Maximum 300 characters."
              },
              artists: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    artistName: { type: Type.STRING },
                    songs: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          title: { type: Type.STRING },
                          album: { type: Type.STRING },
                          releaseYear: { type: Type.STRING },
                          rankingOrdinal: { type: Type.INTEGER },
                          fact: { type: Type.STRING }
                        },
                        required: ["title", "album", "releaseYear", "rankingOrdinal", "fact"]
                      }
                    }
                  },
                  required: ["artistName", "songs"]
                }
              }
            },
            required: ["playlistTitle", "playlistDescription", "artists"]
          }
        }
      });

      const rawText = geminiResponse.text;
      if (!rawText) {
        throw new Error("Gemini returned empty curation text.");
      }

      addLog("success", "Successfully received AI curation metadata from Gemini!");
      const curationData = JSON.parse(rawText);

      // Enforce the character constraints strictly on server side just in case
      let finalTitle = curationData.playlistTitle || "Vibe Blend Curation";
      if (finalTitle.length > 30) {
        finalTitle = finalTitle.slice(0, 27) + "...";
      }

      let finalDescription = curationData.playlistDescription || "A curated custom blend.";
      if (finalDescription.length > 300) {
        finalDescription = finalDescription.slice(0, 297) + "...";
      }

      const spotifySelectedArtistsData: any[] = [];

      // Step 4: Map Gemini-curated track arrays back to raw Spotify IDs/URIs and perform Slicing in code logic (randomized)
      for (const resolvedArt of resolvedArtists) {
        // Find curation data returned by Gemini for this artist
        const geminiArtData = curationData.artists?.find(
          (cand: any) => cand.artistName?.toLowerCase() === resolvedArt.actualName?.toLowerCase() ||
                         cand.artistName?.toLowerCase()?.includes(resolvedArt.actualName?.toLowerCase()) ||
                         resolvedArt.actualName?.toLowerCase()?.includes(cand.artistName?.toLowerCase())
        ) || curationData.artists?.[resolvedArtists.indexOf(resolvedArt)]; // Fallback by order index

        if (!geminiArtData || !Array.isArray(geminiArtData.songs)) {
          addLog("warn", `Missing curation array for "${resolvedArt.actualName}". Skipping...`);
          continue;
        }

        const isDefaultVibe = vibeId === "default";
        let slicedSongsCandidates: any[] = [];

        if (isDefaultVibe) {
          addLog("info", `Curation generated 15 songs for "${resolvedArt.actualName}" (default vibe). Selecting ${songsPerArtist} at random in code...`);
          const randomizedCurationSongs = shuffleArray(geminiArtData.songs);
          slicedSongsCandidates = randomizedCurationSongs.slice(0, Math.min(songsPerArtist, randomizedCurationSongs.length));
        } else {
          addLog("info", `Curation generated ${geminiArtData.songs.length} songs for "${resolvedArt.actualName}" (premium vibe "${vibeId}"). Putting all curated songs directly into the playlist.`);
          slicedSongsCandidates = geminiArtData.songs;
        }

        const mappedSongsList = slicedSongsCandidates.map((gemSong: any) => {
          // Attempt to match song title against Spotify tracks list
          let matched = resolvedArt.rawTracks.find((rt: any) => {
            const rtName = (rt.name || "").toLowerCase();
            const gemName = (gemSong.title || "").toLowerCase();
            return rtName === gemName || rtName.includes(gemName) || gemName.includes(rtName);
          });

          // Compute duration string
          let durationStr = "3:45";
          let durationSec = 225;
          if (matched && matched.duration_ms) {
            durationSec = Math.floor(matched.duration_ms / 1000);
            const mins = Math.floor(durationSec / 60);
            const secs = durationSec % 60;
            durationStr = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
          }

          return {
            title: gemSong.title,
            album: gemSong.album || (matched ? matched.album?.name : null) || "Single",
            releaseYear: gemSong.releaseYear || (matched ? (matched.album?.release_date || "").split("-")[0] : null) || "2020",
            duration: durationStr,
            durationSeconds: durationSec,
            spotifySearchQuery: `${resolvedArt.actualName} - ${gemSong.title}`,
            popularity: matched ? (matched.popularity || 50) : 50,
            rankingOrdinal: gemSong.rankingOrdinal || 1,
            id: matched ? matched.id : null,
            uri: matched ? matched.uri : null,
            href: matched ? (matched.external_urls?.spotify || "") : `https://open.spotify.com/search/${encodeURIComponent(resolvedArt.actualName + " - " + gemSong.title)}`,
            previewUrl: matched ? matched.preview_url : null,
            albumCover: matched ? (matched.album?.images?.[0]?.url || matched.album?.images?.[1]?.url || "") : "",
            fact: gemSong.fact || `An essential masterpiece by the legendary ${resolvedArt.actualName}.`
          };
        });

        spotifySelectedArtistsData.push({
          name: resolvedArt.actualName,
          genres: resolvedArt.genres,
          avatarPlaceholderColor: resolvedArt.avatarPlaceholderColor,
          songs: mappedSongsList
        });
      }

      addLog("success", "Creative blend synthesis complete! Returning curated playlist objects...");

      res.json({
        playlistTitle: finalTitle,
        playlistDescription: finalDescription,
        artists: spotifySelectedArtistsData,
        logs
      });

    } catch (criticalErr: any) {
      addLog("error", `Critical Server-Side Code Exception: ${criticalErr.message}`);
      res.status(500).json({
        error: `Core Blend Engine failed to curate successfully. Message: ${criticalErr.message}`,
        logs
      });
    }
  });

  // API Route - Diagnose Spotify API and Developer Secrets setup status
  app.get("/api/spotify/diagnose", async (req, res) => {
    const logs: string[] = [];
    const pushLog = (msg: string) => logs.push(`[${new Date().toISOString().split("T")[1].slice(0, 8)}] ${msg}`);

    pushLog("Initiating selfcheck diagnostics diagnostics on Spotify credentials integration...");
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    pushLog(`Checking process.env.SPOTIFY_CLIENT_ID: ${clientId ? `Configured (Prefix: ${clientId.slice(0, 5)}... / Length: ${clientId.length})` : "EMPTY"}`);
    pushLog(`Checking process.env.SPOTIFY_CLIENT_SECRET: ${clientSecret ? `Configured (Length: ${clientSecret.length} chars)` : "EMPTY"}`);

    if (!clientId || !clientSecret) {
      pushLog("ERROR: API Keys are not present on Server Environment. Lookups will definitely fail.");
      return res.json({
        success: false,
        step: "secrets_missing",
        message: "Developer integration secrets missing or not configured. View AI Studio Settings/Secrets panel.",
        logs
      });
    }

    try {
      pushLog("Sending POST request to https://accounts.spotify.com/api/token to negotiate client_credentials session...");
      const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      
      const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${creds}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });

      pushLog(`Spotify auth endpoint answered. HTTP STATUS CODE: ${tokenRes.status}`);
      if (!tokenRes.ok) {
        const bodyText = await tokenRes.text();
        pushLog(`Spotify Auth Error body: ${bodyText}`);
        return res.json({
          success: false,
          step: "token_exchange_failed",
          status: tokenRes.status,
          message: `Spotify Accounts Service returned ${tokenRes.status} Error. Credentials credentials authentication failed.`,
          body: bodyText,
          logs
        });
      }

      const tokenData: any = await tokenRes.json();
      pushLog("Negotiation Succeeded! Application bearer token extracted.");
      pushLog(`Token type returned: ${tokenData.token_type || "N/A"}`);
      pushLog(`Validity duration: ${tokenData.expires_in} seconds (${(tokenData.expires_in / 60).toFixed(1)} minutes).`);

      pushLog("Testing active token validity against general Spotify track catalog. Item: 'artist:Beatles'...");
      const testRes = await fetch("https://api.spotify.com/v1/search?q=artist:Beatles&type=track&limit=2", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });

      pushLog(`V1 Catalog endpoint answered. HTTP STATUS CODE: ${testRes.status}`);
      if (!testRes.ok) {
        const testErrBody = await testRes.text();
        pushLog(`Spotify Search Error body: ${testErrBody}`);
        return res.json({
          success: false,
          step: "search_api_failed",
          status: testRes.status,
          message: "API token was generated successfully, but query access to search catalogs is being restricted.",
          logs
        });
      }

      const testData: any = await testRes.json();
      const itemsCount = testData.tracks?.items?.length || 0;
      pushLog(`Test complete! Successfully searched and parsed ${itemsCount} standard track elements from Spotify library.`);

      return res.json({
        success: true,
        message: "Excellent! Your Developer Client integration is healthy, fully Authorized, and ready to lookup artists!",
        logs
      });
    } catch (err: any) {
      pushLog(`CRITICAL NETWORK FAILURE EXCEPTION: ${err.message}`);
      return res.json({
        success: false,
        step: "network_exception",
        error: err.toString(),
        logs
      });
    }
  });

  // API Route - Enrich track metadata using official Spotify Client credentials (search for real album art & previews!)
  app.post("/api/spotify/enrich", async (req, res) => {
    const { queries } = req.body;
    if (!Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({ error: "Invalid queries array." });
    }

    try {
      const appToken = await getSpotifyAppToken();
        if (!appToken) {
          return res.json({ enriched: false, message: "Spotify developer keys not configured on server. Showing static presets." });
        }

      const enrichmentResult = await Promise.all(
        queries.map(async (query: string) => {
          try {
            const searchUrl = `https://api.spotify.com/v1/search?q=${encodeSpotifySearch(query)}&type=track&limit=1`;
            const searchRes = await fetch(searchUrl, {
              headers: { Authorization: `Bearer ${appToken}` },
            });
            if (!searchRes.ok) return { query };
            const searchData: any = await searchRes.json();
            const track = searchData.tracks?.items?.[0];
            if (!track) return { query };

            return {
              query,
              id: track.id,
              uri: track.uri,
              href: track.external_urls.spotify,
              previewUrl: track.preview_url,
              albumCover: track.album?.images?.[0]?.url || track.album?.images?.[1]?.url || "",
              popularity: track.popularity,
              durationMs: track.duration_ms,
            };
          } catch (e) {
            return { query };
          }
        })
      );

      res.json({ enriched: true, tracks: enrichmentResult });
    } catch (err: any) {
      console.error("Spotify Enrichment Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route - Search artists from Spotify API
  app.get("/api/spotify/search-artists", async (req, res) => {
    const q = req.query.q;
    if (!q || typeof q !== "string") {
      return res.status(400).json({ error: "Missing query q." });
    }

    try {
      const appToken = await getSpotifyAppToken();
      const authHeader = req.headers.authorization;
      const userToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
      const token = appToken || userToken;

      if (!token) {
        return res.json({
          error: "Not configured",
          message: "Spotify application credentials are not set on the server, and no active user login is present. Showing static presets only.",
          items: []
        });
      }

      const searchQueryEncoded = encodeSpotifySearch(q);
      const searchUrl = `https://api.spotify.com/v1/search?q=${searchQueryEncoded}&type=artist&limit=6`;
      
      const sRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!sRes.ok) {
        const fallbackUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=artist&limit=6`;
        const fallbackRes = await fetch(fallbackUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!fallbackRes.ok) {
          return res.status(sRes.status).json({ error: `Spotify API responded with status ${sRes.status}` });
        }
        const data = await fallbackRes.json();
        return res.json({ items: data.artists?.items || [] });
      }

      const data = await sRes.json();
      return res.json({ items: data.artists?.items || [] });
    } catch (err: any) {
      console.error("Error in search-artists:", err);
      return res.status(500).json({ error: err.message || "Internal server error" });
    }
  });

  // API Route - Spotify login redirect
  app.get("/api/spotify/login", (req, res) => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    if (!clientId) {
      return res.status(400).send("Spotify Client ID not configured in developer secrets.");
    }
    const { username } = req.query;
    const redirectUri = getRedirectUri(req, PORT);
    const scope = "playlist-modify-public playlist-modify-private user-read-private";
    const state = "spotify-gen-v1-state";

    let spotifyAuthUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&show_dialog=true`;
    
    if (username) {
      const uStr = String(username).trim();
      if (uStr) {
        spotifyAuthUrl += `&username=${encodeURIComponent(uStr)}&login_hint=${encodeURIComponent(uStr)}`;
      }
    }

    res.redirect(spotifyAuthUrl);
  });

  // API Route - Spotify OAuth Callback
  app.get("/api/spotify/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send("Authorization code is missing.");
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirectUri = getRedirectUri(req, PORT);

    try {
      const basicHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicHeader}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: redirectUri,
        }).toString(),
      });

      if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        console.error("Spotify token exchange failed:", errorText);
        return res.status(500).send("Spotify token exchange failed. Confirm your client ID and secret.");
      }

      const tokenData: any = await tokenRes.json();
      const accessToken = tokenData.access_token;
      const expiresIn = tokenData.expires_in;
      const scopes = tokenData.scope || "";

      // Send the gorgeous callback page that posts the authentication back to the parent and closes
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Spotify Connection Successful!</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background-color: #0b0f19;
                color: #FFFFFF;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                text-align: center;
                padding: 20px;
                box-sizing: border-box;
              }
              .card {
                background: linear-gradient(145deg, #111827, #0f172a);
                border: 1px solid #1e293b;
                padding: 40px;
                border-radius: 16px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                max-width: 440px;
              }
              .logo {
                font-size: 50px;
                margin-bottom: 20px;
                display: inline-block;
                animation: pulse 2s infinite ease-in-out;
              }
              h2 {
                color: #1DB954;
                margin-top: 0;
                margin-bottom: 12px;
                font-size: 24px;
                font-weight: 700;
                letter-spacing: -0.025em;
              }
              p {
                color: #94a3b8;
                font-size: 14px;
                line-height: 1.6;
                margin: 0 0 16px 0;
              }
              .badge {
                background-color: #064e3b;
                border: 1px solid #059669;
                color: #34d399;
                display: inline-block;
                padding: 4px 12px;
                border-radius: 9999px;
                font-size: 12px;
                font-family: monospace;
                font-weight: 600;
                margin-top: 8px;
              }
              @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.08); }
              }
            </style>
          </head>
          <body>
            <div class="card">
              <span class="logo">🎵</span>
              <h2>Spotify Connected Successfully!</h2>
              <p>Your Spotify user account has been successfully authenticated.</p>
              <p>This window will close automatically, updating your generation controls.</p>
              <span class="badge">AUTH_GEN_SUCCESS</span>
            </div>
            <script>
              const tokenInfo = {
                type: 'OAUTH_AUTH_SUCCESS',
                accessToken: '${accessToken}',
                expiresIn: '${expiresIn}',
                scopes: '${scopes}'
              };
              
              if (window.opener) {
                // Post to opener regardless of frame
                window.opener.postMessage(tokenInfo, '*');
                setTimeout(function() {
                  window.close();
                }, 1200);
              } else {
                // Fallback for non-popup redirects
                window.location.href = '/?spotify_access_token=${accessToken}&spotify_expires_in=${expiresIn}&spotify_scopes=${encodeURIComponent(scopes)}';
              }
            </script>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Error exchanging code for token:", error);
      res.status(500).send("Authentication callback failed to execute successfully.");
    }
  });

  // API Route - Create Playlist (Save to User's Account)
  app.post("/api/spotify/create-playlist", async (req, res) => {
    const { title, description, trackQueries, tracks } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid Spotify User Access Token." });
    }
    const userAccessToken = authHeader.split(" ")[1];

    if (!title || (!Array.isArray(trackQueries) && !Array.isArray(tracks))) {
      return res.status(400).json({ error: "Title and list of tracks to add are required." });
    }

    try {
      // 1. Get Me Profile
      const meRes = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${userAccessToken}` },
      });
      if (!meRes.ok) {
        const meErr = await meRes.text();
        console.error("Failed to fetch User Profile:", meErr);
        let detailedError = "Failed to verify Spotify user profile with token provided.";
        try {
          const parsed = JSON.parse(meErr);
          if (parsed.error && parsed.error.message) {
            detailedError = `${parsed.error.message} (Status ${meRes.status})`;
          }
        } catch (_) {}
        return res.status(meRes.status).json({ error: detailedError });
      }
      const meData: any = await meRes.json();
      const userId = meData.id;

      // 2. Resolve Track URIs
      const trackUris: string[] = [];
      const appToken = await getSpotifyAppToken();

      if (Array.isArray(tracks)) {
        for (const track of tracks) {
          if (track.uri && track.uri.startsWith("spotify:track:")) {
            trackUris.push(track.uri);
          } else {
            // Search dynamically if uri is missing
            const query = track.query || `${track.artist} - ${track.title}`;
            try {
              // Try global session (MA's Client ID) first as requested, fallback to user's access token
              const searchTokens: string[] = [];
              if (appToken) {
                searchTokens.push(appToken);
              }
              searchTokens.push(userAccessToken);

              let found = false;
              for (const token of searchTokens) {
                const sRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeSpotifySearch(query)}&type=track&limit=1`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (sRes.ok) {
                  const sData: any = await sRes.json();
                  const foundTrack = sData.tracks?.items?.[0];
                  if (foundTrack) {
                    trackUris.push(foundTrack.uri);
                    found = true;
                    break;
                  }
                }
              }
              if (!found) {
                console.warn(`Could not resolve track query: "${query}" using either token.`);
              }
            } catch (searchErr) {
              console.error(`Error searching track query "${query}":`, searchErr);
            }
          }
        }
      } else if (Array.isArray(trackQueries)) {
        for (const trackQuery of trackQueries) {
          try {
            // Try global session (MA's Client ID) first as requested, fallback to user's access token
            const searchTokens: string[] = [];
            if (appToken) {
              searchTokens.push(appToken);
            }
            searchTokens.push(userAccessToken);

            let found = false;
            for (const token of searchTokens) {
              const sRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeSpotifySearch(trackQuery)}&type=track&limit=1`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (sRes.ok) {
                const sData: any = await sRes.json();
                const foundTrack = sData.tracks?.items?.[0];
                if (foundTrack) {
                  trackUris.push(foundTrack.uri);
                  found = true;
                  break;
                }
              }
            }
            if (!found) {
              console.warn(`Could not resolve track query: "${trackQuery}" using either token.`);
            }
          } catch (searchErr) {
            console.error(`Error searching track query "${trackQuery}":`, searchErr);
          }
        }
      }

      if (trackUris.length === 0) {
        return res.status(422).json({ error: "Could not find matches on Spotify for none of the generated tracks." });
      }

      // 3. Create public/private Playlist
      // Truncate description dynamically to respect Spotify's strict 300-char limit
      let playlistDesc = description || "AI Curated Playlist";
      const descSuffix = " - MultiArtistMixer";
      if (playlistDesc.length + descSuffix.length > 300) {
        playlistDesc = playlistDesc.slice(0, 300 - descSuffix.length) + descSuffix;
      } else {
        playlistDesc = playlistDesc + descSuffix;
      }

      let createPlaylistRes = await fetch("https://api.spotify.com/v1/me/playlists", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: title,
          description: playlistDesc,
          public: true,
        }),
      });

      // Automated private fallback
      if (!createPlaylistRes.ok) {
        console.warn("Creating public playlist failed; trying to create private playlist instead...");
        createPlaylistRes = await fetch("https://api.spotify.com/v1/me/playlists", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: title,
            description: playlistDesc,
            public: false,
          }),
        });
      }

      if (!createPlaylistRes.ok) {
        const createErr = await createPlaylistRes.text();
        console.error("Failed to create Spotify playlist:", createErr);
        let detailedError = "Failed to create playlist on Spotify.";
        try {
          const parsed = JSON.parse(createErr);
          if (parsed.error && parsed.error.message) {
            detailedError = `${parsed.error.message} (Status ${createPlaylistRes.status})`;
          }
        } catch (_) {}
        return res.status(createPlaylistRes.status).json({ error: detailedError });
      }
      const playlistData: any = await createPlaylistRes.json();
      const playlistId = playlistData.id;
      const playlistUrl = playlistData.external_urls.spotify;

      // 4. Add resolved tracks to the new playlist
      const addTracksRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uris: trackUris,
        }),
      });

      if (!addTracksRes.ok) {
        const addErr = await addTracksRes.text();
        console.error("Failed to add tracks to Spotify playlist:", addErr);
        let detailedError = "Created playlist but failed to upload tracks.";
        try {
          const parsed = JSON.parse(addErr);
          if (parsed.error && parsed.error.message) {
            detailedError = `Playlist created, but uploading tracks failed: ${parsed.error.message} (Status ${addTracksRes.status})`;
          }
        } catch (_) {}
        return res.status(addTracksRes.status).json({ error: detailedError });
      }

      res.json({
        success: true,
        playlistId,
        playlistUrl,
        resolvedTracksCount: trackUris.length,
      });
    } catch (e: any) {
      console.error("Playlist saving exception:", e);
      res.status(500).json({ error: e.message || "An error occurred while export generating the playlist." });
    }
  });

  // Vite middleware and listener setup helper
async function startViteAndListen() {
  if (process.env.NODE_ENV !== "production") {
    const vitePkg = "vite";
    const { createServer: createViteServer } = await import(vitePkg);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startViteAndListen();
}

export { app };
