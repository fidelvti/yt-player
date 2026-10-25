import { XMLParser } from "fast-xml-parser";
import type { OAuth2Client } from "google-auth-library";
import { authedClient } from "./auth.js";
import { fetchUploads, QuotaExceededError } from "./uploads.js";

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
  ignoreAttributes: false,
  isArray: (name) => name === "entry",
});

interface RssEntry {
  "yt:videoId": string;
  title: string;
  published: string;
  link: { "@_href": string };
}

/** El RSS no marca los shorts, pero su enlace es /shorts/<id> en vez de /watch?v=<id>. */
function isShort(entry: RssEntry): boolean {
  return entry.link?.["@_href"]?.includes("/shorts/") ?? false;
}

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 400;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * El RSS de YouTube falla de forma intermitente (404/500/429 puntuales con la misma URL que
 * funciona segundos después), así que se reintenta antes de darlo por perdido.
 */
async function fetchRss(channelId: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
      if (res.ok) return await res.text();
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err; // error de red
    }
    if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
  }
  throw lastError;
}

type ChannelResult =
  | { channelId: string; status: "ok" | "stale"; videos: FeedVideo[] }
  | { channelId: string; status: "failed" };

// Si la cuota de la API se agota, se tira de RSS un rato en lugar de insistir con la API.
const API_PAUSE_MS = 10 * 60 * 1000;
let apiPausedUntil = 0;

async function fetchViaRss(channelId: string): Promise<FeedVideo[]> {
  const feed = parser.parse(await fetchRss(channelId)).feed;
  const channelTitle = String(feed?.title ?? "");
  const entries: RssEntry[] = feed?.entry ?? [];

  return entries.filter((e) => !isShort(e)).map((e) => ({
    videoId: e["yt:videoId"],
    title: String(e.title),
    channelId,
    channelTitle,
    published: e.published,
    thumbnail: `https://i.ytimg.com/vi/${e["yt:videoId"]}/mqdefault.jpg`,
  }));
}

/** API de YouTube si hay sesión (fiable); si no, o si falla, RSS (gratis pero intermitente). */
async function loadVideos(channelId: string, client: OAuth2Client | null): Promise<FeedVideo[]> {
  if (client && Date.now() >= apiPausedUntil) {
    try {
      return await fetchUploads(client, channelId);
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        apiPausedUntil = Date.now() + API_PAUSE_MS;
        console.warn("Cuota de la API de YouTube agotada: se usa RSS durante 10 minutos");
      } else {
        console.warn(`API ${channelId}: ${(err as Error).message}; se prueba con RSS`);
      }
    }
  }
  return fetchViaRss(channelId);
}

async function fetchChannelFeed(channelId: string, force: boolean, client: OAuth2Client | null): Promise<ChannelResult> {
  const hit = cache.get(channelId);
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return { channelId, status: "ok", videos: hit.videos };

  try {
    const videos = await loadVideos(channelId, client);
    cache.set(channelId, { at: Date.now(), videos });
    return { channelId, status: "ok", videos };
  } catch (err) {
    console.warn(`Feed ${channelId}: ${(err as Error).message}`);
    // Mejor mostrar los vídeos de la última vez que funcionó que hacer desaparecer el canal.
    return hit ? { channelId, status: "stale", videos: hit.videos } : { channelId, status: "failed" };
  }
}

export interface FeedResult {
  /** Vídeos de todos los canales, del más nuevo al más antiguo. */
  videos: FeedVideo[];
  /** Canales que no respondieron y de los que no hay datos anteriores: sus vídeos faltan. */
  failed: string[];
  /** Canales que no respondieron pero se muestran con los datos de la última carga correcta. */
  stale: string[];
}

const CONCURRENCY = 8;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

export async function fetchFeed(channelIds: string[], force = false): Promise<FeedResult> {
  const client = await authedClient();
  const results = await mapLimit(channelIds, CONCURRENCY, (id) => fetchChannelFeed(id, force, client));
  const videos: FeedVideo[] = [];
  const failed: string[] = [];
  const stale: string[] = [];
  for (const r of results) {
    if (r.status === "failed") failed.push(r.channelId);
    else {
      if (r.status === "stale") stale.push(r.channelId);
      videos.push(...r.videos);
    }
  }
  videos.sort((a, b) => b.published.localeCompare(a.published));
  return { videos, failed, stale };
}
