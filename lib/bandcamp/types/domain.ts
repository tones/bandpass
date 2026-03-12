// lib/bandcamp/types/domain.ts

export type StoryType = 'new_release' | 'friend_purchase' | 'my_purchase';

export interface FeedItem {
  id: string;
  storyType: StoryType;
  date: Date;
  album: {
    id: number;
    title: string;
    url: string;
    imageUrl: string;
  };
  artist: {
    id: number;
    name: string;
    url: string;
  };
  track: {
    title: string;
    duration: number;
    streamUrl: string | null;
  } | null;
  tags: string[];
  price: { amount: number; currency: string } | null;
  socialSignal: {
    fan: { name: string; username: string } | null;
    alsoCollectedCount: number;
  };
}

export interface FeedPage {
  items: FeedItem[];
  oldestStoryDate: number;
  newestStoryDate: number;
  hasMore: boolean;
}

export interface CollectionPage {
  items: FeedItem[];
  lastToken: string;
  hasMore: boolean;
}

export interface WishlistItem {
  id: string;
  tralbumId: number;
  tralbumType: 'a' | 't';
  title: string;
  artistName: string;
  artistUrl: string;
  imageUrl: string;
  itemUrl: string;
  featuredTrackTitle: string | null;
  featuredTrackDuration: number | null;
  streamUrl: string | null;
  alsoCollectedCount: number;
  isPreorder: boolean;
  tags: string[];
}

export interface WishlistPage {
  items: WishlistItem[];
  lastToken: string;
  hasMore: boolean;
}
