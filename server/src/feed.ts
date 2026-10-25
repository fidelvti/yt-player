import { XMLParser } from "fast-xml-parser";

export interface FeedVideo {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  published: string;
  thumbnail: string;
}

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; videos: FeedVideo[] }>();

const parser = new XMLParser({
  isArray: (name) => name === "entry",
});

interface RssEntry {
  "yt:videoId": string;
  title: string;
  published: string;
}

async function fetchChannelFeed(channelId: string): Promise<FeedVideo[]> {
  const hit = cache.get(channelId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.videos;

  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  if (!res.ok) throw new Error(`RSS ${channelId}: HTTP ${res.status}`);

  const feed = parser.parse(await res.text()).feed;
  const channelTitle = String(feed?.title ?? "");
  const entries: RssEntry[] = feed?.entry ?? [];

  const videos = entries.map((e) => ({
    videoId: e["yt:videoId"],
    title: String(e.title),
    channelId,
    channelTitle,
    published: e.published,
    thumbnail: `https://i.ytimg.com/vi/${e["yt:videoId"]}/mqdefault.jpg`,
  }));
  cache.set(channelId, { at: Date.now(), videos });
  return videos;
}

/** Vídeos recientes de varios canales, del más nuevo al más antiguo. Un canal que falla no tumba el resto. */
export async function fetchFeed(channelIds: string[]): Promise<FeedVideo[]> {
  const results = await Promise.allSettled(channelIds.map(fetchChannelFeed));
  const videos: FeedVideo[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") videos.push(...r.value);
    else console.error(r.reason);
  }
  return videos.sort((a, b) => b.published.localeCompare(a.published));
}
