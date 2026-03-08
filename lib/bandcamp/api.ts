import { BandcampClient } from './client';
import type {
  BandcampCollectionSummary,
  BandcampFeedResponse,
  BandcampFeedStory,
  BandcampFanInfo,
} from './types/api';
import type { FeedItem, FeedPage, StoryType } from './types/domain';

const STORY_TYPE_MAP: Record<string, StoryType> = {
  nr: 'new_release',
  fp: 'friend_purchase',
  np: 'also_purchased',
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

    const items = raw.stories.entries.map((story) =>
      this.normalizeStory(story, raw.fan_info, trackStreamUrls),
    );

    return {
      items,
      oldestStoryDate: raw.stories.oldest_story_date,
      newestStoryDate: raw.stories.newest_story_date,
      hasMore: items.length > 0,
    };
  }

  async getFeedPages(options?: { pages?: number; olderThan?: number }): Promise<FeedPage> {
    const pageCount = options?.pages ?? 1;
    let olderThan = options?.olderThan;
    const allItems: FeedItem[] = [];
    let newestStoryDate = 0;
    let oldestStoryDate = 0;
    let hasMore = true;

    for (let i = 0; i < pageCount; i++) {
      const page = await this.getFeed({ olderThan });
      allItems.push(...page.items);
      if (i === 0) newestStoryDate = page.newestStoryDate;
      oldestStoryDate = page.oldestStoryDate;

      if (!page.hasMore) {
        hasMore = false;
        break;
      }
      olderThan = page.oldestStoryDate;
    }

    return { items: allItems, oldestStoryDate, newestStoryDate, hasMore };
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
      storyType: STORY_TYPE_MAP[story.story_type] ?? 'also_purchased',
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
