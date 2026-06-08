export interface Song {
  title: string;
  album: string;
  releaseYear: string;
  duration: string;
  durationSeconds: number;
  spotifySearchQuery: string;
  popularity: number;
  rankingOrdinal?: number;
  fact: string;
  // Enriched parameters from real-time Spotify lookup
  id?: string;
  uri?: string;
  href?: string;
  previewUrl?: string | null;
  albumCover?: string;
}

export interface ArtistData {
  name: string;
  genres: string[];
  avatarPlaceholderColor: string;
  songs: Song[];
}

export interface PlaylistData {
  playlistTitle: string;
  playlistDescription: string;
  artists: ArtistData[];
}
