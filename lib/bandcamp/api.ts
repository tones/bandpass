import { BandcampClient } from './client';
import type {
  BandcampCollectionSummary,
  BandcampCollectionItem,
  BandcampCollectionResponse,
  BandcampFeedResponse,
  BandcampFeedStory,
  BandcampFanInfo,
} from './types/api';
import type { CollectionPage, FeedItem, FeedPage, StoryType } from './types/domain';

const STORY_TYPE_MAP: Record<string, StoryType> = {
  nr: 'new_release',
  fp: 'friend_purchase',
};

export class BandcampAPI {
  private client: BandcampClient;
  private fanIdCache: number | null = null;

  constructor(identityCookie: string) {
    this.client = new BandcampClient(identityCookie);
  }

  async getFanId(): Promise<number> {
    if (this.fanIdCache) return this.fanIdCache;
    const summary = await this.client.get<BandcampCollectionSummary>(
      '/api/fan/2/collection_summary',
    );
    this.fanIdCache = summary.fan_id;
    return summary.fan_id;
  }

  async getFeed(options?: { olderThan?: number }): Promise<FeedPage> {
    const fanId = await this.getFanId();
    const olderThan = options?.olderThan ?? Math.floor(Date.now() / 1000);

    const raw = await this.client.postForm<BandcampFeedResponse>(
      '/fan_dash_feed_updates',
      {
        fan_id: String(fanId),
        older_than: String(olderThan),
      },
    );

    const trackStreamUrls = new Map<number, string>();
    if (Array.isArray(raw.stories.track_list)) {
      for (const t of raw.stories.track_list) {
        const url = t.streaming_url?.['mp3-128'];
        if (url) trackStreamUrls.set(t.track_id, url);
      }
    }

    const items = raw.stories.entries
      .filter((story) => story.story_type in STORY_TYPE_MAP)
      .map((story) => this.normalizeStory(story, raw.fan_info, trackStreamUrls));

    return {
      items,
      oldestStoryDate: raw.stories.oldest_story_date,
      newestStoryDate: raw.stories.newest_story_date,
      hasMore: items.length > 0,
    };
  }

  async getCollection(options?: { olderThanToken?: string; count?: number }): Promise<CollectionPage> {
    const fanId = await this.getFanId();
    const count = options?.count ?? 100;
    const olderThanToken = options?.olderThanToken ?? `${Math.floor(Date.now() / 1000)}::a:`;

    const raw = await this.client.postJson<BandcampCollectionResponse>(
      '/api/fancollection/1/collection_items',
      {
        fan_id: fanId,
        older_than_token: olderThanToken,
        count,
      },
    );

    const items = raw.items.map((item) =>
      this.normalizeCollectionItem(item, fanId, raw.tracklists),
    );

    return {
      items,
      lastToken: raw.last_token,
      hasMore: raw.more_available,
    };
  }

  private normalizeCollectionItem(
    item: BandcampCollectionItem,
    fanId: number,
    tracklists: Record<string, { file: Record<string, string> | null; duration: number | null; title: string }>,
  ): FeedItem {
    const tracklistKey = item.tralbum_type === 'a' ? `a${item.tralbum_id}` : `t${item.tralbum_id}`;
    const tracklist = tracklists[tracklistKey];
    const streamUrl = tracklist?.file?.['mp3-v0'] ?? tracklist?.file?.['mp3-128'] ?? null;

    const trackTitle = item.featured_track_title ?? tracklist?.title ?? null;
    const trackDuration = item.featured_track_duration ?? tracklist?.duration ?? null;

    return {
      id: `mp-${item.tralbum_id}-${fanId}-${item.purchased}`,
      storyType: 'my_purchase',
      date: new Date(item.purchased),
      album: {
        id: item.album_id,
        title: item.album_title || item.item_title,
        url: item.item_url,
        imageUrl: item.item_art_url,
      },
      artist: {
        id: item.band_id,
        name: item.band_name,
        url: item.band_url,
      },
      track: trackTitle
        ? {
            title: trackTitle,
            duration: trackDuration ?? 0,
            streamUrl,
          }
        : null,
      tags: [],
      price: item.price ? { amount: item.price, currency: item.currency } : null,
      socialSignal: {
        fan: null,
        alsoCollectedCount: item.also_collected_count,
      },
    };
  }

  private normalizeStory(
    story: BandcampFeedStory,
    fanInfo: Record<string, BandcampFanInfo>,
    trackStreamUrls: Map<number, string>,
  ): FeedItem {
    const fan = story.fan_id && fanInfo[String(story.fan_id)];

    let streamUrl = story.featured_track_url;
    if (!streamUrl && story.featured_track) {
      streamUrl = trackStreamUrls.get(story.featured_track) ?? null;
    }

    return {
      id: `${story.story_type}-${story.tralbum_id}-${story.fan_id}-${story.story_date}`,
      storyType: STORY_TYPE_MAP[story.story_type] ?? 'new_release',
      date: new Date(story.story_date),
      album: {
        id: story.album_id,
        title: story.album_title || story.item_title,
        url: story.item_url,
        imageUrl: story.item_art_url,
      },
      artist: {
        id: story.band_id,
        name: story.band_name,
        url: story.band_url,
      },
      track: story.featured_track_title
        ? {
            title: story.featured_track_title,
            duration: story.featured_track_duration,
            streamUrl,
          }
        : null,
      tags: story.tags?.filter((t) => !t.isloc).map((t) => t.norm_name) ?? [],
      price: story.is_purchasable
        ? { amount: story.price, currency: story.currency }
        : null,
      socialSignal: {
        fan: fan ? { name: fan.name, username: fan.username } : null,
        alsoCollectedCount: story.also_collected_count,
      },
    };
  }
}
