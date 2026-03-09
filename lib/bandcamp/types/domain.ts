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
