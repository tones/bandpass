// lib/bandcamp/types/api.ts

// --- Collection Summary (GET /api/fan/2/collection_summary) ---

export interface BandcampCollectionSummary {
  fan_id: number;
  collection_summary: {
    fan_id: number;
    tralbum_lookup: Record<string, unknown>;
    follows: {
      following: Record<string, boolean>;
    };
    url: string;
    username: string;
  };
}

// --- Feed (POST /fan_dash_feed_updates) ---

export interface BandcampFeedResponse {
  ok: boolean;
  stories: {
    entries: BandcampFeedStory[];
    oldest_story_date: number;
    newest_story_date: number;
    track_list: {
      entries: BandcampFeedTrack[];
    };
    feed_timestamp: number | null;
  };
  fan_info: Record<string, BandcampFanInfo>;
  band_info: Record<string, BandcampBandInfo>;
  story_collectors: Record<string, unknown>;
  item_lookup: Record<string, { item_type: 'a' | 't'; purchased: boolean }>;
}

export interface BandcampFeedStory {
  fan_id: number;
  item_id: number;
  item_type: 'a' | 't';
  tralbum_id: number;
  band_id: number;
  story_type: 'nr' | 'fp' | 'np';
  story_date: string;
  item_title: string;
  item_url: string;
  item_art_url: string;
  item_art_id: number;
  band_name: string;
  band_url: string;
  genre_id: number;
  is_purchasable: boolean;
  currency: string;
  price: number;
  album_id: number;
  album_title: string;
  featured_track_title: string;
  featured_track_number: number;
  featured_track_duration: number;
  featured_track_url: string | null;
  also_collected_count: number;
  num_streamable_tracks: number;
  tags: { name: string; norm_name: string }[];
}

export interface BandcampFeedTrack {
  track_id: number;
  title: string;
  artist: string;
  album_id: number;
  album_title: string;
  band_id: number;
  band_name: string;
  band_url: string;
  item_art_id: number;
  duration: number;
  file: Record<string, string>;
  track_number: number;
}

export interface BandcampFanInfo {
  fan_id: number;
  name: string;
  username: string;
  image_id: number;
  trackpipe_url: string;
}

export interface BandcampBandInfo {
  name: string;
  band_id: number;
  image_id: number;
  genre_id: number;
  followed: boolean;
}
