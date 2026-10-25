import type { OAuth2Client } from "google-auth-library";
import type { FeedVideo } from "./feed.js";

const API = "https://www.googleapis.com/youtube/v3/playlistItems";
const MAX_VIDEOS = 15;
const MAX_LIVES = 5;
const ATTEMPTS = 3;

/** Se ha agotado la cuota diaria de la API de YouTube. */
export class QuotaExceededError extends Error {}

interface PlaylistItem {
  snippet: { title: string; channelTitle?: string };
  contentDetails: { videoId: string; videoPublishedAt?: string };
}

interface ApiErrorShape {
  response?: { status?: number; data?: { error?: { errors?: { reason?: string }[] } } };
}

/**
 * Un elemento de una lista de subidas, o null si la lista no existe (404).
 * Cada llamada cuesta 1 unidad de cuota (el límite diario por defecto es de 10.000).
 */
async function playlist(client: OAuth2Client, playlistId: string, max: number): Promise<PlaylistItem[] | null> {
  const url = `${API}?part=snippet,contentDetails&maxResults=${max}&playlistId=${playlistId}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await client.request<{ items?: PlaylistItem[] }>({ url });
      return res.data.items ?? [];
    } catch (err) {
      const { response } = err as ApiErrorShape;
      if (response?.status === 404) return null;
      if (response?.data?.error?.errors?.[0]?.reason === "quotaExceeded") {
        throw new QuotaExceededError("Cuota diaria de la API de YouTube agotada");
      }
      // Los 5xx de Google ("Internal error encountered") son puntuales: se reintentan.
      const transient = response === undefined || (response.status ?? 0) >= 500;
      if (!transient || attempt >= ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
}

/**
 * Vídeos recientes de un canal sin shorts, a partir de sus listas de subidas.
 * YouTube mantiene una lista por tipo con el mismo id del canal cambiando el prefijo "UC":
 * UULF = vídeos largos (sin shorts ni directos) y UULV = directos. Juntas son todo menos los shorts.
 */
export async function fetchUploads(client: OAuth2Client, channelId: string): Promise<FeedVideo[]> {
  if (!channelId.startsWith("UC")) throw new Error(`ID de canal no válido: ${channelId}`);
  const suffix = channelId.slice(2);

  const [videos, lives] = await Promise.all([
    playlist(client, `UULF${suffix}`, MAX_VIDEOS),
    playlist(client, `UULV${suffix}`, MAX_LIVES),
  ]);
  if (videos === null && lives === null) throw new Error(`El canal ${channelId} no tiene listas de subidas`);

  return [...(videos ?? []), ...(lives ?? [])]
    .filter((it) => it.contentDetails.videoPublishedAt && it.snippet.title !== "Private video" && it.snippet.title !== "Deleted video")
    .map((it) => ({
      videoId: it.contentDetails.videoId,
      title: it.snippet.title,
      channelId,
      channelTitle: it.snippet.channelTitle ?? "",
      published: it.contentDetails.videoPublishedAt!,
      thumbnail: `https://i.ytimg.com/vi/${it.contentDetails.videoId}/mqdefault.jpg`,
    }))
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, MAX_VIDEOS);
}
