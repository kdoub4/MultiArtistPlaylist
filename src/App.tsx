import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Play,
  Pause,
  ArrowLeft,
  AlertCircle,
  Trash2,
  Plus,
  Search,
  Music,
  ExternalLink,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Check,
  Loader2,
  Download,
  ArrowUp,
  ArrowDown,
  LogOut,
  Info,
  Disc,
  ListTodo,
  Volume2,
  Terminal,
  Wrench,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { PRESET_ARTISTS, PRESET_VIBES } from "./data";
import { Song, ArtistData, PlaylistData } from "./types";

export default function App() {
  // Config state
  const [spotifyConfigured, setSpotifyConfigured] = useState<{ configured: boolean; clientId: string; redirectUri?: string }>({ configured: false, clientId: "" });
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tokenScopes, setTokenScopes] = useState<string>("");
  const [is403Error, setIs403Error] = useState(false);
  const [spotifyUsername, setSpotifyUsername] = useState("kdoub4cr@gmail.com");
  const [executionLogs, setExecutionLogs] = useState<Array<{ timestamp: string; level: string; message: string }>>([]);
  const [diagnosticResult, setDiagnosticResult] = useState<{ success: boolean; message: string; logs: string[]; step?: string; status?: number; body?: string } | null>(null);
  const [testingDiagnostics, setTestingDiagnostics] = useState(false);

  // Selector state
  const [selectedArtists, setSelectedArtists] = useState<string[]>([]);
  const [songsPerArtist, setSongsPerArtist] = useState<number>(4);
  const [customArtistInput, setCustomArtistInput] = useState("");
  const [selectedVibe, setSelectedVibe] = useState("default");
  const [customInstructions, setCustomInstructions] = useState("");
  const [artistSearchQuery, setArtistSearchQuery] = useState("");
  const [isPresetsCollapsed, setIsPresetsCollapsed] = useState(true);

  const getVibeName = (vibeId: string) => {
    const v = PRESET_VIBES.find((item) => item.id === vibeId);
    if (!v) return "";
    if (v.id === "default") {
      return `Default (${songsPerArtist} of the Most Popular ${songsPerArtist === 1 ? 'Song' : 'Songs'})`;
    }
    return v.name;
  };

  // Loading & interactive states
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Final Playlist state
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);

  // Live Syncing state
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<{ url: string; count: number } | null>(null);

  // Browser Audio preview state
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load config & OAuth parameters from query
  useEffect(() => {
    // 1. Fetch Spotify server-side config status
    fetch("/api/spotify/config")
      .then((res) => res.json())
      .then((data) => setSpotifyConfigured(data))
      .catch((err) => console.error("Failed to load Spotify configuration:", err));

    // 2. Parse OAuth tokens from callback URL redirect parameters
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("spotify_access_token");
    const expiresIn = urlParams.get("spotify_expires_in");
    const scopes = urlParams.get("spotify_scopes");

    if (token) {
      localStorage.setItem("spotify_access_token", token);
      const expiresAt = Date.now() + parseInt(expiresIn || "3600") * 1000;
      localStorage.setItem("spotify_expires_at", expiresAt.toString());
      if (scopes) {
        localStorage.setItem("spotify_scopes", scopes);
        setTokenScopes(scopes);
      }

      // Clean query parameters from URL history smoothly
      const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.replaceState({ path: cleanUrl }, "", cleanUrl);
      setAccessToken(token);
    } else {
      // Load current cached token if valid
      const cachedToken = localStorage.getItem("spotify_access_token");
      const expiresAt = localStorage.getItem("spotify_expires_at");
      const cachedScopes = localStorage.getItem("spotify_scopes") || "";
      if (cachedToken && expiresAt) {
        if (Date.now() < parseInt(expiresAt)) {
          setAccessToken(cachedToken);
          setTokenScopes(cachedScopes);
        } else {
          localStorage.removeItem("spotify_access_token");
          localStorage.removeItem("spotify_expires_at");
          localStorage.removeItem("spotify_scopes");
        }
      }
    }
  }, []);

  // Listen for success message from popup (after callback completes)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      // Allow from current preview app domain or local hosts
      if (!origin.endsWith(".run.app") && !origin.includes("localhost")) {
        return;
      }
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        const { accessToken: token, expiresIn, scopes } = event.data;
        if (token) {
          localStorage.setItem("spotify_access_token", token);
          const expiresAt = Date.now() + parseInt(expiresIn || "3600") * 1000;
          localStorage.setItem("spotify_expires_at", expiresAt.toString());
          if (scopes) {
            localStorage.setItem("spotify_scopes", scopes);
            setTokenScopes(scopes);
          } else {
            setTokenScopes("playlist-modify-public playlist-modify-private user-read-private");
          }
          setAccessToken(token);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Popup-based Spotify Login handler to bypass iframe blockages
  const handleSpotifyLogin = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!spotifyConfigured.configured || !spotifyConfigured.clientId) {
      setError("Spotify developer credentials are not fully configured yet in the Settings panel.");
      setTimeout(() => setError(null), 5000);
      return;
    }

    const clientId = spotifyConfigured.clientId;
    const redirectUri = spotifyConfigured.redirectUri || `${window.location.origin}/api/spotify/callback`;
    const scope = "playlist-modify-public playlist-modify-private user-read-private";
    const state = "spotify-gen-v1-state";

    let spotifyAuthUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&show_dialog=true`;

    if (spotifyUsername) {
      const uStr = spotifyUsername.trim();
      if (uStr) {
        spotifyAuthUrl += `&username=${encodeURIComponent(uStr)}&login_hint=${encodeURIComponent(uStr)}`;
      }
    }

    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    const authWindow = window.open(
      spotifyAuthUrl,
      "spotify_oauth_popup",
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=yes`
    );

    if (!authWindow) {
      alert("Please allow popups for this site to authorize Spotify.");
    }
  };

  // Sync token logouts
  const handleSpotifyLogout = () => {
    localStorage.removeItem("spotify_access_token");
    localStorage.removeItem("spotify_expires_at");
    localStorage.removeItem("spotify_scopes");
    setAccessToken(null);
    setTokenScopes("");
    setSaveSuccess(null);
    setIs403Error(false);
  };

  // Diagnostics runner for checking credentials & Spotify API health
  const handleRunDiagnostics = () => {
    setTestingDiagnostics(true);
    setDiagnosticResult(null);
    fetch("/api/spotify/diagnose")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Server returned HTTP status ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setDiagnosticResult(data);
      })
      .catch((err) => {
        setDiagnosticResult({
          success: false,
          message: `Network/connection failed: ${err.message}`,
          logs: ["Client-side request failed to reach backend API.", err.toString()]
        });
      })
      .finally(() => {
        setTestingDiagnostics(false);
      });
  };

  // Add artist logic
  const handleAddArtist = (artistName: string) => {
    const pieces = artistName.split(",").map(p => p.trim()).filter(Boolean);
    if (pieces.length === 0) return;

    let addedCount = 0;
    let alreadyExistsCount = 0;
    const currentList = [...selectedArtists];

    for (const piece of pieces) {
      if (currentList.some((a) => a.toLowerCase() === piece.toLowerCase())) {
        alreadyExistsCount++;
        continue;
      }
      if (currentList.length >= 10) {
        setError("Maximum limit of 10 artists reached (max 10 allowed).");
        setTimeout(() => setError(null), 3500);
        break;
      }
      currentList.push(piece);
      addedCount++;
    }

    if (addedCount > 0) {
      setSelectedArtists(currentList);
      setCustomArtistInput("");
    } else if (alreadyExistsCount > 0) {
      setError("Specified artist(s) are already selected!");
      setTimeout(() => setError(null), 3000);
    }
  };

  // Remove artist logic
  const handleRemoveArtist = (artistName: string) => {
    setSelectedArtists(selectedArtists.filter((a) => a !== artistName));
  };

  // Format seconds to readable length (e.g. "365" -> "6:05")
  const formatSeconds = (totalSecs: number) => {
    const m = Math.floor(totalSecs / 60);
    const s = Math.floor(totalSecs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Calculate overall metrics
  const totalDurationSeconds = useMemo(() => {
    if (!playlist) return 0;
    return playlist.artists.reduce((acc, art) => {
      return acc + art.songs.reduce((sAcc, song) => sAcc + (song.durationSeconds || 0), 0);
    }, 0);
  }, [playlist]);

  const totalTracksCount = useMemo(() => {
    if (!playlist) return 0;
    return playlist.artists.reduce((acc, art) => acc + art.songs.length, 0);
  }, [playlist]);

  // Playlist list flatter representation (for reordering, indexing, and tables)
  const flattenedTracks = useMemo(() => {
    if (!playlist) return [];
    const tList: (Song & { artistName: string; artistColor: string })[] = [];
    
    // Rotate through artists round-robin to create a beautifully integrated mixture list
    const maxSongs = Math.max(...playlist.artists.map((art) => art.songs.length), 0);
    
    for (let i = 0; i < maxSongs; i++) {
      playlist.artists.forEach((art) => {
        if (art.songs[i]) {
          tList.push({
            ...art.songs[i],
            artistName: art.name,
            artistColor: art.avatarPlaceholderColor,
          });
        }
      });
    }
    return tList;
  }, [playlist]);

  // Reorder tracks state directly
  const [reorderedTracks, setReorderedTracks] = useState<(Song & { artistName: string; artistColor: string })[]>([]);

  useEffect(() => {
    if (playlist) {
      setReorderedTracks(flattenedTracks);
    } else {
      setReorderedTracks([]);
    }
  }, [playlist, flattenedTracks]);

  // Audio Handler
  const togglePlayPreview = (track: Song & { artistName: string }) => {
    if (!track.previewUrl) return;

    if (playingTrack === track.spotifySearchQuery && audioRef.current) {
      audioRef.current.pause();
      setPlayingTrack(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(track.previewUrl);
      audio.volume = 0.45;
      audio.addEventListener("ended", () => {
        setPlayingTrack(null);
      });
      audioRef.current = audio;
      audio.play().catch((err) => console.error("Audio trigger failed:", err));
      setPlayingTrack(track.spotifySearchQuery);
    }
  };

  // Cleanup audio playbacks
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Reordering action utils
  const moveTrack = (index: number, direction: "up" | "down") => {
    const newIdx = direction === "up" ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= reorderedTracks.length) return;

    const updated = [...reorderedTracks];
    const temp = updated[index];
    updated[index] = updated[newIdx];
    updated[newIdx] = temp;
    setReorderedTracks(updated);
  };

  const removeTrackFromSequence = (index: number) => {
    setReorderedTracks(reorderedTracks.filter((_, i) => i !== index));
  };

  // Generate Playlist triggers
  const handleGeneratePlaylist = async () => {
    if (selectedArtists.length < 2) {
      setError("Please select at least 2 artists to blend.");
      return;
    }
    if (selectedArtists.length > 10) {
      setError("You can select at maximum 10 artists.");
      return;
    }

    setLoading(true);
    setPlaylist(null);
    setError(null);
    setSaveSuccess(null);
    setExecutionLogs([]);

    // Dynamic step alerts of loading state
    const loadingStatements = [
      "Contacting Dynamic Curation Engine...",
      "Resolving official discographies of selected artists...",
      "Researching Spotify streams index and trend ratings...",
      "Comparing release records, albums, and duration metrics...",
      "Analyzing song acoustics and structuring creative flow...",
      "Applying vibe criteria filters...",
      "Synthesizing historic musical trivia records...",
      "Enriching audio nodes and metadata..."
    ];

    let stepIndex = 0;
    setLoadingStep(loadingStatements[0]);
    const stepInterval = setInterval(() => {
      stepIndex = (stepIndex + 1) % loadingStatements.length;
      setLoadingStep(loadingStatements[stepIndex]);
    }, 2800);

    try {
      const activeVibe = PRESET_VIBES.find((v) => v.id === selectedVibe);
      const moodInstruction = activeVibe ? `${activeVibe.name} (${activeVibe.desc}). ${customInstructions}` : customInstructions;

      const response = await fetch("/api/generate-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artists: selectedArtists,
          vibePreference: moodInstruction,
          songsPerArtist,
        }),
      });

      let data: any = {};
      const responseText = await response.text();
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        if (!response.ok) {
          throw new Error(`Failed to generate playlist metadata. Server returned status ${response.status}.`);
        }
        throw new Error("Invalid response format received from server.");
      }
      
      if (data.logs) {
        setExecutionLogs(data.logs);
      }

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate playlist metadata.");
      }

      const generatedData: PlaylistData = data;

      // Trigger automatic background enrichment of Track IDs, real covers, and audios from Spotify
      try {
        setLoadingStep("Matching tracks with real-time Spotify catalog visuals & previews...");
        const queries = generatedData.artists.flatMap((art) =>
          art.songs.map((s) => `${art.name} - ${s.title}`)
        );

        const enrichResponse = await fetch("/api/spotify/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queries }),
        });

        if (enrichResponse.ok) {
          const enrichData = await enrichResponse.json();
          if (enrichData.enriched && Array.isArray(enrichData.tracks)) {
            // Map enriched artifacts back into our playlist state structure
            const enrichedArtists = generatedData.artists.map((art) => {
              const updatedSongs = art.songs.map((song) => {
                const queryStr = `${art.name} - ${song.title}`.toLowerCase();
                const matched = enrichData.tracks.find(
                  (t: any) => t.query && t.query.toLowerCase() === queryStr
                );
                if (matched) {
                  return {
                    ...song,
                    id: matched.id,
                    uri: matched.uri,
                    href: matched.href,
                    previewUrl: matched.previewUrl,
                    albumCover: matched.albumCover,
                    // Optionally use real live Spotify popularity
                    popularity: matched.popularity || song.popularity,
                  };
                }
                return song;
              });
              return { ...art, songs: updatedSongs };
            });

            generatedData.artists = enrichedArtists;
          }
        }
      } catch (enrichErr) {
        console.warn("Spotify catalog search enrichment bypassed:", enrichErr);
      }

      setPlaylist(generatedData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An exception occurred while building the playlist.");
    } finally {
      clearInterval(stepInterval);
      setLoading(false);
    }
  };

  // Save to Real Spotify Account
  const handleSaveToSpotify = async () => {
    if (!accessToken || !playlist) return;

    setIsSaving(true);
    setSaveSuccess(null);
    setError(null);

    try {
      const title = playlist.playlistTitle;
      const description = playlist.playlistDescription;
      // Get complete track details with URI if available to speed up and secure resolution
      const tracks = reorderedTracks.map((t) => ({
        title: t.title,
        artist: t.artistName,
        uri: t.uri,
        query: `${t.artistName} - ${t.title}`
      }));

      const res = await fetch("/api/spotify/create-playlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title,
          description,
          tracks,
        }),
      });

      const resText = await res.text();
      let resJson: any = {};
      try {
        resJson = JSON.parse(resText);
      } catch (parseExc) {
        if (!res.ok) {
          throw new Error(`Failed to save playlist. Server returned HTTP ${res.status}.`);
        }
      }

      if (!res.ok) {
        if (res.status === 403) {
          setIs403Error(true);
        }
        throw new Error(resJson.error || `Failed to save playlist (Status ${res.status}).`);
      }

      setSaveSuccess({
        url: resJson.playlistUrl,
        count: resJson.resolvedTracksCount,
      });
    } catch (err: any) {
      console.error("Save failed:", err);
      setError(err.message || "Failed to save playlist to Spotify library.");
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to copy text to clipboard
  const [copiedText, setCopiedText] = useState(false);
  const copyToClipboard = () => {
    if (!playlist) return;
    const bulletList = reorderedTracks
      .map((t, idx) => `${idx + 1}. ${t.artistName} - ${t.title} [Album: ${t.album}, ${t.releaseYear}]`)
      .join("\n");
    const fullText = `🎵 ${playlist.playlistTitle}\n"${playlist.playlistDescription}"\n\nTracks:\n${bulletList}`;

    navigator.clipboard.writeText(fullText).then(() => {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    });
  };

  // Helper to trigger custom CSV file download
  const handleDownloadCSV = () => {
    if (!playlist) return;
    const headers = ["#", "Artist", "Track Title", "Album", "Year", "Duration", "Popularity 0-100", "Trivia Trivia Facts"];
    const rows = reorderedTracks.map((t, i) => [
      i + 1,
      `"${t.artistName.replace(/"/g, '""')}"`,
      `"${t.title.replace(/"/g, '""')}"`,
      `"${t.album.replace(/"/g, '""')}"`,
      t.releaseYear,
      t.duration,
      t.popularity,
      `"${t.fact.replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const sanitizedTitle = playlist.playlistTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    link.setAttribute("download", `${sanitizedTitle}_playlist.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Set preset artist quickly action
  const togglePresetArtist = (artistName: string) => {
    if (selectedArtists.includes(artistName)) {
      handleRemoveArtist(artistName);
    } else {
      handleAddArtist(artistName);
    }
  };

  // Filter preset list
  const filteredPresets = useMemo(() => {
    return PRESET_ARTISTS.filter((p) =>
      p.name.toLowerCase().includes(artistSearchQuery.toLowerCase())
      || p.genre.toLowerCase().includes(artistSearchQuery.toLowerCase())
    );
  }, [artistSearchQuery]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-[#1DB954] selection:text-black">
      {/* Upper Subtle Ambient Glow */}
      <div className="absolute top-0 left-1/4 right-1/4 h-72 bg-gradient-to-b from-[#1DB954]/10 to-transparent blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="relative border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md z-30">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#1DB954] flex items-center justify-center shadow-lg shadow-[#1DB954]/20 animate-pulse">
              <Disc className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white animate-pulse-slow">
                Spotify Playlist Generator
              </h1>
              <p className="text-xs text-zinc-400">Powered by Spotify API & Custom Curation Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {accessToken ? (
              <div className="flex items-center gap-3 bg-zinc-800/80 border border-zinc-700/60 px-3 py-1.5 rounded-full text-xs">
                <span className="flex items-center gap-1.5 text-zinc-200">
                  <span className="w-2 h-2 rounded-full bg-[#1DB954] animate-ping" />
                  Spotify Authenticated
                </span>
                <button
                  onClick={handleSpotifyLogout}
                  className="text-zinc-400 hover:text-white flex items-center gap-1 font-medium transition-colors"
                  title="Logout Spotify Link"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              </div>
            ) : (
              spotifyConfigured.configured ? (
                <button
                  onClick={handleSpotifyLogin}
                  className="bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold text-xs px-4 py-2 rounded-full transition-all duration-200 flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Disc className="w-4 h-4 text-black animate-spin-slow" />
                  Connect Spotify
                </button>
              ) : (
                <div className="text-[10.5px] max-w-60 bg-zinc-900 border border-zinc-800 p-2 rounded text-zinc-400 text-right">
                  <span className="text-zinc-300 font-medium font-mono">Local Sync Blocked:</span> Secrets not set in panel. (CSV & Copy enabled)
                </div>
              )
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative max-w-6xl mx-auto px-4 py-8 z-10">
        <AnimatePresence mode="wait">
          {!playlist ? (
            /* ==================================== BUILDER VIEW ==================================== */
            <motion.div
              key="builder-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
              id="generator-config"
            >
              {/* Left Column: Config Panel */}
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-zinc-900/60 border border-zinc-800/80 p-6 rounded-2xl backdrop-blur-md shadow-xl flex flex-col justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-white tracking-tight flex items-center gap-2">
                      <SlidersHorizontal className="w-5 h-5 text-[#1DB954]" />
                      Blend Parameters
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1">
                      Choose between 2 and 10 artists. The engine compiles their top 20 songs and selects 4 at random (using server-to-server Spotify API credentials, if configured) to create a fresh, dynamic blend on every generation!
                    </p>
                  </div>

                  {/* Manual input */}
                  <div className="mt-6">
                    <label className="block text-xs font-medium text-zinc-300 mb-2">Search or Add Any Music Artist</label>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAddArtist(customArtistInput);
                      }}
                      className="flex gap-2"
                    >
                      <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                          type="text"
                          value={customArtistInput}
                          onChange={(e) => setCustomArtistInput(e.target.value)}
                          placeholder="e.g. Led Zeppelin, Daft Punk, Drake, Lorde..."
                          className="w-full bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 focus:border-[#1DB954] text-white rounded-xl py-3 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-zinc-600"
                        />
                      </div>
                      <button
                        type="submit"
                        className="bg-[#1DB954] hover:bg-[#1ed760] active:scale-95 text-black px-5 rounded-xl font-bold text-sm transition-all flex items-center gap-1.5 shadow-lg shadow-[#1DB954]/10"
                      >
                        <Plus className="w-4 h-4 stroke-[3px]" />
                        Add
                      </button>
                    </form>
                  </div>

                  {/* Songs Per Artist text entry input */}
                  <div className="mt-4 flex items-center justify-between bg-zinc-950/40 border border-zinc-800/40 rounded-xl p-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-zinc-200">Songs per Artist</span>
                      <span className="text-[10px] text-zinc-400">Number of curated songs to blend per artist (1-10)</span>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={songsPerArtist}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                        setSongsPerArtist(val);
                      }}
                      className="w-16 bg-zinc-900 border border-zinc-800 text-center text-white py-1.5 rounded-lg text-xs font-bold outline-none focus:border-[#1DB954] focus:ring-1 focus:ring-[#1DB954]"
                    />
                  </div>

                  {/* Active Selection Chip Tray */}
                  <div className="mt-6 border-t border-zinc-800/80 pt-6">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                        <ListTodo className="w-4 h-4 text-[#1DB954]" />
                        Selected Artists ({selectedArtists.length} / 10)
                      </span>
                      {selectedArtists.length > 0 && (
                        <button
                          onClick={() => setSelectedArtists([])}
                          className="text-[10.5px] text-zinc-500 hover:text-zinc-300 font-medium transition-colors"
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>

                    <div className="min-h-16 bg-zinc-950/40 border border-zinc-800/50 rounded-xl p-3 flex flex-wrap gap-2 items-center justify-center">
                      {selectedArtists.length === 0 ? (
                        <div className="text-xs text-zinc-600 font-mono text-center select-none py-3">
                          [ No artists chosen yet. Use the presets below or enter names. ]
                        </div>
                      ) : (
                        <AnimatePresence>
                          {selectedArtists.map((artist) => (
                            <motion.span
                              key={artist}
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.8, opacity: 0 }}
                              className="inline-flex items-center gap-1.5 bg-gradient-to-r from-zinc-800 to-zinc-900 border border-zinc-700/60 pl-3.5 pr-2.5 py-1.5 rounded-full text-xs font-medium text-white shadow-sm"
                            >
                              {artist}
                              <button
                                onClick={() => handleRemoveArtist(artist)}
                                className="text-zinc-500 hover:text-red-400 p-0.5 rounded-full hover:bg-zinc-800 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </motion.span>
                          ))}
                        </AnimatePresence>
                      )}
                    </div>

                    {/* Alert checks */}
                    {selectedArtists.length > 0 && selectedArtists.length < 2 && (
                      <div className="mt-2.5 flex items-center gap-1.5 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        Please select at least 2 artists to generate.
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick Presets Finder */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 p-6 rounded-2xl backdrop-blur-md shadow-xl transition-all duration-300">
                  <div 
                    className="flex items-center justify-between gap-3 cursor-pointer select-none" 
                    onClick={() => setIsPresetsCollapsed(!isPresetsCollapsed)}
                  >
                    <div>
                      <h3 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
                        Popular Preset Selection
                        <span className="text-[10px] text-[#1DB954] bg-[#1DB954]/10 border border-[#1DB954]/20 px-2.5 py-0.5 rounded-full font-mono font-medium">
                          {isPresetsCollapsed ? "Show" : "Hide"} ({PRESET_ARTISTS.length})
                        </span>
                      </h3>
                      <p className="text-[11px] text-zinc-500">Quickly tap to toggle popular foundational artists</p>
                    </div>
                    <button className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors cursor-pointer">
                      {isPresetsCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                  </div>

                  {!isPresetsCollapsed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="mt-6 space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/40 p-3 rounded-xl border border-zinc-800/40">
                        <span className="text-[11px] text-zinc-400">Can't find an artist in the preset list?</span>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                          <input
                            type="text"
                            placeholder="Filter presets..."
                            value={artistSearchQuery}
                            onChange={(e) => setArtistSearchQuery(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-zinc-950 border border-zinc-800 rounded-lg py-1 pl-8 pr-3 text-xs outline-none focus:border-[#1DB954] w-full sm:w-48 text-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                        {filteredPresets.map((preset) => {
                          const isSelected = selectedArtists.includes(preset.name);
                          return (
                            <button
                              key={preset.name}
                              onClick={() => togglePresetArtist(preset.name)}
                              className={`p-2.5 rounded-xl text-left text-xs transition-all flex items-center justify-between border cursor-pointer ${
                                isSelected
                                  ? "bg-emerald-950/30 border-[#1DB954] text-[#1DB954]"
                                  : "bg-zinc-950/40 border-zinc-800/60 text-zinc-400 hover:border-zinc-700 hover:text-white"
                              }`}
                            >
                              <span className="truncate pr-1">
                                <span className="block font-medium truncate">{preset.name}</span>
                                <span className="block text-[9.5px] text-zinc-500 font-mono mt-0.5">{preset.genre}</span>
                              </span>
                              <span className="flex-shrink-0">
                                {isSelected ? (
                                  <Check className="w-3.5 h-3.5 stroke-[3px]" />
                                ) : (
                                  <Plus className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Right Column: Preferences Sidebar */}
              <div className="lg:col-span-4 space-y-6">
                {/* Vibe Selection */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 p-6 rounded-2xl backdrop-blur-md shadow-xl">
                  <h3 className="text-sm font-semibold text-white tracking-wide flex items-center gap-1.5 mb-3">
                    <Music className="w-4 h-4 text-[#1DB954]" />
                    Aesthetic Vibe Criteria
                  </h3>
                  <div className="space-y-2">
                    {PRESET_VIBES.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVibe(v.id)}
                        className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          selectedVibe === v.id
                            ? "bg-emerald-950/20 border-[#1DB954] text-white"
                            : "bg-zinc-950/55 border-zinc-800/60 text-zinc-400 hover:border-zinc-700/90 hover:text-zinc-200"
                        }`}
                      >
                        <span className="text-xs font-bold block">{getVibeName(v.id)}</span>
                        <span className="text-[10px] text-zinc-500 block mt-0.5 leading-relaxed">{v.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Prompt Fine-tuning */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 p-6 rounded-2xl backdrop-blur-md shadow-xl">
                  <h3 className="text-sm font-semibold text-white tracking-wide flex items-center gap-1.5 mb-2">
                    <SlidersHorizontal className="w-4 h-4 text-[#1DB954]" />
                    Custom Directives
                  </h3>
                  <p className="text-[10px] text-zinc-400 leading-relaxed mb-3">
                    Add custom instructions (e.g., "Exclude heavy rock", "Include acoustic versions", "Filter for late 1990s tracks").
                  </p>
                  <textarea
                    rows={3}
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="Enter style parameters or boundaries..."
                    className="w-full bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 focus:border-[#1DB954] text-xs text-white rounded-xl p-3 outline-none transition-all placeholder:text-zinc-700 resize-none font-sans"
                  />
                </div>

                {/* Generate Launcher Trigger */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 p-6 rounded-2xl backdrop-blur-md shadow-xl text-center">
                  {error && (
                    <div className="mb-4 text-xs font-medium text-red-300 bg-red-400/10 border border-red-500/20 px-3 py-2 rounded-xl flex items-center gap-1.5 text-left">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    disabled={selectedArtists.length < 2 || loading}
                    onClick={handleGeneratePlaylist}
                    className="w-full bg-[#1DB954] hover:bg-[#1ed760] active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:border-transparent disabled:scale-100 disabled:cursor-not-allowed text-black font-bold text-sm py-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-[#1DB954]/10 cursor-pointer"
                  >
                    <Sparkles className="w-4.5 h-4.5 text-black animate-pulse" />
                    Generate AI Playlist
                  </button>

                  <div className="mt-3 flex items-center justify-center gap-1 text-[10px] text-zinc-500 font-mono">
                    <span>Vibe: {getVibeName(selectedVibe)}</span>
                    <span>•</span>
                    <span>Selected: {selectedArtists.length}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            /* ==================================== GENERATED DASHBOARD VIEW ==================================== */
            <motion.div
              key="playlist-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35 }}
              className="space-y-6"
              id="playlist-workspace"
            >
              {/* Back & Modify link */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    setPlaylist(null);
                    setSaveSuccess(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white font-semibold transition-colors bg-zinc-900/80 hover:bg-zinc-800 px-3.5 py-2 border border-zinc-800/60 rounded-xl"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Modify Selection / Back
                </button>

                <div className="text-xs text-zinc-500 font-mono flex items-center gap-1">
                  <span>Curation state: COMPLETE</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954]" />
                </div>
              </div>

              {/* Top Banner: Big Glass Cover */}
              <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 p-6 md:p-8 rounded-3xl relative overflow-hidden flex flex-col md:flex-row gap-6 items-center shadow-2xl">
                {/* Background ambient lighting */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-tr from-[#1DB954]/10 to-transparent blur-3xl pointer-events-none" />

                {/* Custom grid pseudo-artwork cover */}
                <div className="w-40 h-40 bg-zinc-950 border-2 border-zinc-800 rounded-2xl flex-shrink-0 relative overflow-hidden flex flex-wrap gap-0.5 shadow-xl select-none group">
                  {playlist.artists.slice(0, 4).map((art, i) => (
                    <div
                      key={i}
                      style={{ backgroundColor: art.avatarPlaceholderColor + "15" }}
                      className="w-[79px] h-[79px] flex flex-col items-center justify-center border border-zinc-800/40 relative"
                    >
                      <span
                        style={{ color: art.avatarPlaceholderColor }}
                        className="text-2xl font-black font-mono tracking-tighter"
                      >
                        {art.name.charAt(0)}
                      </span>
                      <span className="absolute bottom-1 text-[8px] text-zinc-500 max-w-full truncate font-medium font-mono">
                        {art.name.substring(0, 5)}
                      </span>
                    </div>
                  ))}
                  {playlist.artists.length < 4 && (
                    <div className="absolute inset-0 bg-gradient-to-r from-[#1DB954]/5 to-transparent flex items-center justify-center font-bold text-[#1DB954] text-xs">
                      AI HYBRID
                    </div>
                  )}

                  {/* Centered Decorative CD Icon Overlay */}
                  <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center shadow-lg">
                    <Disc className="w-4 h-4 text-[#1DB954] animate-spin-slow" />
                  </div>
                </div>

                {/* Banner Metadata Info */}
                <div className="flex-1 space-y-3.5 text-center md:text-left">
                  <div>
                    <span className="text-[10px] bg-emerald-950/50 text-[#1DB954] border border-emerald-900 font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      AI Generated Custom Blend
                    </span>
                    <h2 className="text-2xl md:text-4xl font-extrabold text-white mt-1.5 tracking-tight leading-tight">
                      {playlist.playlistTitle}
                    </h2>
                  </div>

                  <p className="text-sm text-zinc-300 leading-relaxed max-w-2xl">
                    {playlist.playlistDescription}
                  </p>

                  <div className="flex flex-wrap gap-1.5 justify-center md:justify-start pt-1">
                    <span className="text-[11px] bg-zinc-950/60 border border-zinc-800/80 px-2.5 py-1 rounded-full text-zinc-400 font-medium">
                      Total: <strong className="text-white">{totalTracksCount} tracks</strong>
                    </span>
                    <span className="text-[11px] bg-zinc-950/60 border border-zinc-800/80 px-2.5 py-1 rounded-full text-zinc-400 font-medium">
                      Duration: <strong className="text-white">{formatSeconds(totalDurationSeconds)}</strong>
                    </span>
                    <span className="text-[11px] bg-zinc-950/60 border border-zinc-800/80 px-2.5 py-1 rounded-full text-zinc-400 font-medium font-mono">
                      Vibe preference: <strong className="text-zinc-200">{getVibeName(selectedVibe)}</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Dual grid workflow items */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Side: Playlist interactive tracks manager */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="bg-zinc-900/60 border border-[#1DB954]/10 p-6 rounded-2xl backdrop-blur-md shadow-xl">
                    <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 pb-4 mb-4">
                      <div>
                        <h3 className="text-base font-semibold text-white tracking-tight flex items-center gap-1.5">
                          <Volume2 className="w-5 h-5 text-[#1DB954]" />
                          Interactive Playlist Tracklist
                        </h3>
                        <p className="text-[11.5px] text-zinc-400 mt-0.5">
                          Customized sequence. Order or isolate individual tracks before exporting. Click info buttons to read behind-the-scenes song facts.
                        </p>
                      </div>

                      <div className="text-xs text-zinc-500 font-mono select-none">
                        {reorderedTracks.length} / {totalTracksCount} Tracks active
                      </div>
                    </div>

                    {reorderedTracks.length === 0 ? (
                      <div className="py-12 border border-dashed border-zinc-800/80 rounded-xl text-center">
                        <Disc className="w-10 h-10 text-zinc-700 mx-auto animate-spin-slow mb-3" />
                        <p className="text-xs text-zinc-500 font-mono">Your playlist track is currently empty. Re-generate to reset.</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[720px] overflow-y-auto pr-1 scrollbar-thin">
                        <AnimatePresence>
                          {reorderedTracks.map((track, idx) => {
                            const isPlaying = playingTrack === track.spotifySearchQuery;
                            return (
                              <motion.div
                                key={`${track.spotifySearchQuery}-${idx}`}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                transition={{ duration: 0.2 }}
                                style={{
                                  borderLeftColor: isPlaying ? "#1DB954" : track.artistColor || "#1DB954",
                                }}
                                className={`group flex flex-col md:flex-row items-stretch md:items-center justify-between p-3.5 rounded-xl border border-zinc-850/60 bg-zinc-950/40 border-l-[4px] hover:bg-zinc-800/30 transition-all ${
                                  isPlaying ? "shadow-md shadow-[#1DB954]/5 bg-emerald-950/10 border-l-[#1DB954]" : ""
                                }`}
                              >
                                {/* Track identity + basic Info */}
                                <div className="flex items-center gap-3.5 flex-1 min-w-0">
                                  {/* Track index / album art cover placeholder wrapper */}
                                  <div className="w-11 h-11 rounded-lg border border-zinc-800 overflow-hidden bg-zinc-900 relative flex-shrink-0 group-hover:scale-105 transition-transform flex items-center justify-center">
                                    {track.albumCover ? (
                                      <img
                                        src={track.albumCover}
                                        alt={track.album}
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div
                                        style={{ color: track.artistColor }}
                                        className="font-bold font-mono text-center text-sm"
                                      >
                                        {track.artistName.charAt(0)}
                                      </div>
                                    )}

                                    {/* Action Hover play preview trigger if available */}
                                    {track.previewUrl && (
                                      <button
                                        onClick={() => togglePlayPreview(track)}
                                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                                        title="Play audio preview"
                                      >
                                        {isPlaying ? (
                                          <Pause className="w-4 h-4 text-[#1DB954]" />
                                        ) : (
                                          <Play className="w-4 h-4 text-white hover:text-[#1DB954] fill-white hover:fill-[#1DB954]" />
                                        )}
                                      </button>
                                    )}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <h4 className="text-xs font-bold text-white truncate max-w-72">
                                        {track.title}
                                      </h4>
                                      <span className="text-[9px] text-zinc-500 font-mono px-1 border border-zinc-800 rounded">
                                        {track.releaseYear}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1 text-[10.5px] mt-0.5 font-medium">
                                      <span className="text-zinc-300 truncate max-w-44">{track.artistName}</span>
                                      <span className="text-zinc-600 font-mono">•</span>
                                      <span className="text-zinc-500 font-mono truncate max-w-48">{track.album}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Fact block integration */}
                                <div className="mt-3 md:mt-0 px-2 flex-1 md:max-w-md lg:max-w-xs text-left bg-zinc-950 border border-zinc-900 rounded-lg py-1.5 pr-2 pl-3 relative shadow-inner md:mx-4 flex items-start gap-1.5">
                                  <Info className="w-3.5 h-3.5 text-[#1DB954] flex-shrink-0 mt-0.5 hover:scale-105 transition-transform" />
                                  <span className="text-[10px] text-zinc-400 italic block leading-relaxed line-clamp-2 md:line-clamp-3">
                                    {track.fact}
                                  </span>
                                </div>

                                {/* Metadata metrics (duration and popularity metric) & positioning controls */}
                                <div className="mt-4 md:mt-0 flex items-center justify-between md:justify-end gap-3 flex-shrink-0">
                                  <div className="text-right flex flex-col justify-center items-end">
                                    <span className="text-[10.5px] text-zinc-500 font-mono">{track.duration}</span>
                                    {/* Small design score line */}
                                    <div className="flex items-center gap-1 mt-1">
                                      {track.rankingOrdinal !== undefined ? (
                                        <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-md">
                                          Rank #{track.rankingOrdinal}
                                        </span>
                                      ) : (
                                        <>
                                          <span className="text-[9px] text-zinc-600 font-mono">Popularity:</span>
                                          <div className="w-12 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                                            <div
                                              style={{ width: `${track.popularity}%` }}
                                              className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full"
                                            />
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  {/* Direct external search linker if they want context */}
                                  <a
                                    href={track.href || `https://open.spotify.com/search/${encodeURIComponent(track.spotifySearchQuery)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1.5 bg-zinc-900 hover:bg-zinc-800 hover:text-[#1DB954] text-zinc-400 rounded-lg transition-colors border border-zinc-800"
                                    title="Open song in Spotify Catalog"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>

                                  {/* sequence reordering and deletion triggers */}
                                  <div className="flex items-center gap-0.5 border-l border-zinc-800 pl-2">
                                    <button
                                      disabled={idx === 0}
                                      onClick={() => moveTrack(idx, "up")}
                                      className="p-1 text-zinc-500 hover:text-white hover:bg-zinc-900 rounded disabled:opacity-20 disabled:hover:text-zinc-500 disabled:hover:bg-transparent"
                                      title="Move Track Up"
                                    >
                                      <ArrowUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      disabled={idx === reorderedTracks.length - 1}
                                      onClick={() => moveTrack(idx, "down")}
                                      className="p-1 text-zinc-500 hover:text-white hover:bg-zinc-900 rounded disabled:opacity-20 disabled:hover:text-zinc-500 disabled:hover:bg-transparent"
                                      title="Move Track Down"
                                    >
                                      <ArrowDown className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => removeTrackFromSequence(idx)}
                                      className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-950/20 rounded ml-1 transition-colors"
                                      title="Exclude Track"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: Export Integration widgets panel */}
                <div className="lg:col-span-4 space-y-6">
                  {/* Account Connect Actions */}
                  <div className="bg-zinc-900/60 border border-zinc-800/80 p-6 rounded-2xl backdrop-blur-md shadow-xl">
                    <h3 className="text-sm font-semibold text-white tracking-wide flex items-center gap-1.5 mb-2">
                      <Disc className="w-4 h-4 text-[#1DB954]" />
                      Spotify Integration Sync
                    </h3>
                    <p className="text-[10.5px] text-zinc-400 leading-relaxed mb-4">
                      Create this custom blend into your real accounts. This compiles matching tracks dynamically onto your public Spotify library!
                    </p>

                    {accessToken ? (
                      <div className="space-y-4">
                        <div className="p-3 bg-emerald-950/20 border border-emerald-900/50 rounded-xl">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#1DB954] animate-pulse" />
                            <span className="text-xs font-bold text-zinc-200">Session Linked Sync Ready</span>
                          </div>
                          <p className="text-[10px] text-[#1DB954] mt-1 italic">
                            Sync will create a fresh playlist containing your {reorderedTracks.length} tracks.
                          </p>
                        </div>

                        {error && (
                          <div className="space-y-3">
                            <div className="text-xs text-red-400 bg-red-400/10 border border-red-500/20 p-2.5 rounded-lg flex items-start gap-1.5">
                              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                              <span>{error}</span>
                            </div>

                            {is403Error && (
                              <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl p-3 text-left">
                                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[10.5px] uppercase tracking-wider mb-1.5">
                                  <AlertCircle className="w-4.5 h-4.5 flex-shrink-0" />
                                  <span>Spotify Sandbox Restriction</span>
                                </div>
                                <p className="text-[10px] text-zinc-300 leading-relaxed mb-3">
                                  Spotify strictly limits playlist curation & API writes for development-mode applications to whitelisted users. To resolve this error:
                                </p>
                                <div className="space-y-3 font-sans border-t border-zinc-805/80 pt-2.5">
                                  <div className="text-[10px] text-zinc-400 leading-relaxed">
                                    <strong className="text-zinc-200 block mb-0.5">1. Add to Sandbox Users List:</strong>
                                    Go to your <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-[#1DB954] hover:underline">Spotify Developer Dashboard</a>, select your app, click on the **Settings** (or **Users and Access**) panel, and add your active Spotify email (<span className="text-zinc-200 font-mono">{spotifyUsername || "your-spotify-email"}</span>).
                                  </div>
                                  <div className="text-[10px] text-zinc-400 leading-relaxed">
                                    <strong className="text-zinc-200 block mb-0.5">2. Check Active Browser Session:</strong>
                                    Make sure you authorized with the EXACT email whitelisted above. If your browser auto-logged in with a different personal account, log out first:
                                    <button
                                      onClick={handleSpotifyLogout}
                                      className="mt-1.5 w-full text-center bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 font-bold py-1 px-2 rounded border border-zinc-700 text-[9.5px]/1.2 cursor-pointer transition-all"
                                    >
                                      Force Disconnect & Log Out Spotify Session
                                    </button>
                                  </div>
                                  <div className="text-[10px] text-zinc-400 leading-relaxed">
                                    <strong className="text-zinc-200 block mb-0.5">3. Try Private/Incognito Window:</strong>
                                    Open this app in a private window to prevent Spotify from silently reusing a cached session, then login & link Spotify there.
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <button
                          onClick={handleSaveToSpotify}
                          disabled={isSaving || reorderedTracks.length === 0}
                          className="w-full bg-[#1DB954] hover:bg-[#1ed760] active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-bold text-xs py-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-[#1DB954]/5 cursor-pointer"
                        >
                          {isSaving ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-black" />
                              Saving to Library...
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4 stroke-[3.5px] text-black" />
                              Create Playlist on Spotify
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3.5">
                        {spotifyConfigured.configured ? (
                          <>
                            <div className="text-xs text-zinc-400 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800 leading-relaxed">
                              🔒 <strong>OAuth Authentication Active</strong>. Connect your user account to authorize writing playlists directly to your profile.
                            </div>
                            <button
                              onClick={handleSpotifyLogin}
                              className="w-full bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-xs py-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                            >
                              <Disc className="w-4 h-4 text-black animate-spin-slow" />
                              Authorize & Login with Spotify
                            </button>
                          </>
                        ) : (
                          <div className="text-xs text-zinc-400 bg-zinc-950/80 p-3 border border-zinc-800 rounded-xl leading-relaxed space-y-2">
                            <p className="text-zinc-300 font-semibold text-[10.5px] uppercase tracking-wide text-[#1DB954]">
                              ⚠️ Spotify secrets not set
                            </p>
                            <p className="text-[10px] text-zinc-500">
                              To upload directly onto Spotify, add your Spotify Developer keys into the <strong>Settings &gt; Secrets</strong> dashboard panel.
                            </p>
                            <span className="block border-t border-zinc-800/80 my-2" />
                            <ol className="list-decimal pl-4 text-[9.5px]/1.4 text-zinc-400 space-y-1">
                              <li>Client ID: <code className="bg-zinc-900 border border-zinc-800 px-1 rounded text-zinc-200">SPOTIFY_CLIENT_ID</code></li>
                              <li>Client Secret: <code className="bg-zinc-900 border border-zinc-800 px-1 rounded text-zinc-200">SPOTIFY_CLIENT_SECRET</code></li>
                              <li>Add callback to Spotify Dash: <code className="bg-zinc-900 border border-zinc-800 p-1 rounded font-mono break-all text-zinc-300 select-all block mt-1">{spotifyConfigured.clientId ? `${window.location.origin}/api/spotify/callback` : `${window.location.origin}/api/spotify/callback`}</code></li>
                            </ol>
                            <p className="text-[9.5px] text-amber-500/80 italic mt-1.5">
                              *Meanwhile, feel free to use the CSV file and Clipboard export options below right now!
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Success Dialog badge */}
                    {saveSuccess && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-4 p-4 border border-emerald-500/30 bg-emerald-950/20 rounded-xl space-y-3"
                      >
                        <div className="flex items-center gap-2 text-xs font-bold text-[#1DB954]">
                          <span className="w-5 h-5 rounded-full bg-[#1DB954] flex items-center justify-center text-zinc-950">
                            ✓
                          </span>
                          Import Succeeded!
                        </div>
                        <p className="text-[10 px] text-zinc-300">
                          Merged <strong>{saveSuccess.count} tracks</strong> perfectly onto your new custom Spotify library playlist.
                        </p>
                        <a
                          href={saveSuccess.url}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700/60 font-semibold text-xs py-2 rounded-lg text-center flex items-center justify-center gap-1 transition-all"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View Playlist on Spotify App
                        </a>
                      </motion.div>
                    )}
                  </div>

                  {/* Standard file exporters */}
                  <div className="bg-zinc-900/60 border border-zinc-800/80 p-6 rounded-2xl backdrop-blur-md shadow-xl space-y-3">
                    <h3 className="text-sm font-semibold text-white tracking-wide">Standard File Exports</h3>

                    <button
                      onClick={copyToClipboard}
                      className="w-full p-2.5 bg-zinc-950/50 hover:bg-zinc-955 border border-zinc-800 hover:border-zinc-700 rounded-xl text-xs font-bold text-zinc-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {copiedText ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400 stroke-[3px]" />
                          Copied details to clipboard!
                        </>
                      ) : (
                        <>
                          <Share2 className="w-4 h-4 text-zinc-400" />
                          Copy Tracklist & Details
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleDownloadCSV}
                      className="w-full p-2.5 bg-zinc-950/50 hover:bg-zinc-955 border border-zinc-800 hover:border-zinc-700 rounded-xl text-xs font-bold text-zinc-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-zinc-400" />
                      Download Spreadsheet CSV
                    </button>
                  </div>

                  {/* Trivia fact details summary */}
                  <div className="bg-zinc-900/40 border border-zinc-800/60 p-5 rounded-2xl backdrop-blur-md">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-semibold mb-2">
                      <Sparkles className="w-4 h-4 text-[#1DB954]" />
                      Playlist Summary Stats
                    </div>
                    <ul className="space-y-2 text-[10.5px] text-zinc-400">
                      <li className="flex justify-between">
                        <span>Distinct Artists:</span>
                        <span className="text-zinc-200 uppercase font-bold">{playlist.artists.length}</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Total Tracklist Count:</span>
                        <span className="text-zinc-200">{reorderedTracks.length}</span>
                      </li>
                      {reorderedTracks.some(t => t.rankingOrdinal !== undefined) ? (
                        <li className="flex justify-between">
                          <span>Average Curated Rank:</span>
                          <span className="text-[#1DB954] font-bold font-mono">
                            #{(reorderedTracks.reduce((acc, t) => acc + (t.rankingOrdinal || 0), 0) / (reorderedTracks.length || 1)).toFixed(1)}
                          </span>
                        </li>
                      ) : (
                        <li className="flex justify-between">
                          <span>Average Song Stream Rating:</span>
                          <span className="text-[#1DB954] font-bold font-mono">
                            {Math.round(
                              reorderedTracks.reduce((acc, t) => acc + t.popularity, 0) / (reorderedTracks.length || 1)
                            )}
                            %
                          </span>
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Embedded Full-Width Loader overlay screen */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-zinc-950/95 backdrop-blur-lg flex flex-col items-center justify-center z-50 p-6 text-center"
          >
            <div className="space-y-6 max-w-lg">
              {/* Rotating glowing CD logo */}
              <div className="relative w-24 h-24 mx-auto bg-gradient-to-tr from-emerald-500 to-[#1DB954] rounded-full flex items-center justify-center shadow-2xl shadow-[#1DB954]/20 animate-spin">
                <div className="w-10 h-10 rounded-full bg-zinc-950 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-zinc-800" />
                </div>
              </div>

              <div>
                <h3 className="text-xl font-extrabold text-white tracking-tight flex items-center justify-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#1DB954] animate-pulse" />
                  Generating Custom Playlist Blend
                </h3>
                <p className="text-xs text-zinc-400 mt-1">Please hold. Our programmatic curation engine is researching metrics...</p>
              </div>

              {/* Progress step message */}
              <div className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl max-w-md mx-auto">
                <span className="text-xs font-mono font-bold text-[#1DB954] block truncate">
                  {loadingStep || "Analyzing catalogs..."}
                </span>
              </div>

              <div className="text-[10px] text-zinc-650 italic">
                *Fun Fact: Custom blend tracks will include 4 of the most popular singles of your {selectedArtists.length} chosen artists.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
