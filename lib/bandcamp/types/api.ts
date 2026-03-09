// Types matching the ACTUAL Bandcamp API responses.
// Derived from inspecting live responses, March 8 2026.

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
    track_list: BandcampFeedTrack[];
    query_times: Record<string, unknown>;
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
  tralbum_type: 'a' | 't';
  band_id: number;
  why: string | null;
  featured_track: number;
  sale_item_id: number | null;
  sale_item_type: string | null;
  purchased: string | null;
  added: string | null;
  updated: string | null;
  story_date: string;
  story_type: 'nr' | 'fp' | 'np';
  item_title: string;
  item_url: string;
  item_art_url: string;
  item_art_id: number;
  item_art: {
    url: string;
    thumb_url: string;
    art_id: number;
  } | null;
  url_hints: {
    subdomain: string;
    custom_domain: string | null;
    custom_domain_verified: boolean | null;
    slug: string;
    item_type: string;
  } | null;
  band_name: string;
  band_url: string;
  band_location: string | null;
  band_image_id: number | null;
  genre_id: number;
  is_purchasable: boolean;
  is_set_price: boolean;
  currency: string;
  price: number;
  label: string | null;
  label_id: number | null;
  album_id: number;
  album_title: string;
  featured_track_title: string;
  featured_track_number: number;
  featured_track_duration: number;
  featured_track_url: string | null;
  featured_track_encodings_id: number | null;
  featured_track_is_custom: boolean;
  num_streamable_tracks: number;
  also_collected_count: number;
  download_available: boolean;
  is_preorder: boolean;
  is_giftable: boolean;
  is_subscriber_only: boolean;
  is_private: boolean;
  tags: BandcampTag[];
}

export interface BandcampTag {
  name: string;
  norm_name: string;
  isloc: boolean;
  loc_id: number | null;
  geoname?: {
    id: number;
    name: string;
    fullname: string;
  };
}

export interface BandcampFeedTrack {
  track_id: number;
  title: string;
  track_num: number;
  streaming_url: Record<string, string>;
  duration: number;
  encodings_id: number;
  album_title: string;
  band_name: string;
  band_id: number;
  art_id: number;
  album_id: number;
  is_streamable: boolean;
  is_purchasable: boolean;
  price: number;
  currency: string;
  label: string | null;
  label_id: number | null;
}

export interface BandcampFanInfo {
  fan_id: number;
  name: string;
  username: string;
  image_id: number;
  fav_genre_id: number | null;
  fav_genre_name: string | null;
  bio: string | null;
  is_montage_image: number;
  followed: number;
  collection_size: number;
  trackpipe_url: string;
  num_items_in_common: number;
  followed_by: { fan_id: number; username: string; name: string }[];
}

export interface BandcampBandInfo {
  band_id: number;
  name: string;
  image_id: number;
  genre_id: number | null;
  latest_art_id: number | null;
  followed: number;
}

// --- Collection (POST /api/fancollection/1/collection_items) ---

export interface BandcampCollectionResponse {
  items: BandcampCollectionItem[];
  more_available: boolean;
  last_token: string;
  tracklists: Record<string, BandcampCollectionTracklist>;
}

export interface BandcampCollectionItem {
  fan_id: number;
  tralbum_id: number;
  tralbum_type: 'a' | 't';
  band_id: number;
  band_name: string;
  band_url: string;
  album_id: number;
  album_title: string;
  item_title: string;
  item_url: string;
  item_art_url: string;
  item_art_id: number;
  item_type: 'album' | 'track';
  featured_track_title: string | null;
  featured_track_duration: number | null;
  purchased: string;
  price: number;
  currency: string;
  also_collected_count: number;
  token: string;
}

export interface BandcampCollectionTracklist {
  file: Record<string, string> | null;
  duration: number | null;
  title: string;
}
