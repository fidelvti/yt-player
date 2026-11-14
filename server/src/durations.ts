import type { OAuth2Client } from "google-auth-library";
import { db } from "./db.js";
import { QuotaExceededError } from "./uploads.js";

const BATCH = 50; // máximo de ids por consulta de videos.list (1 unidad de cuota por consulta)
const KEEP_MS = 60 * 24 * 60 * 60 * 1000; // los vídeos del feed son recientes: lo antiguo se olvida

/** "PT1H2M3S" -> 3723 segundos. Devuelve null si el formato no es el esperado. */
export function parseIsoDuration(iso: string): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => (x === undefined ? 0 : Number(x)));
  return d * 86400 + h * 3600 + min * 60 + s;
}

/** Duraciones ya guardadas de esos vídeos (video_id -> segundos). */
export function cachedDurations(ids: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = db
      .prepare(`SELECT video_id, seconds FROM video_durations WHERE video_id IN (${chunk.map(() => "?").join(",")})`)
      .all(...chunk) as { video_id: string; seconds: number }[];
    for (const r of rows) result.set(r.video_id, r.seconds);
  }
  return result;
}

/**
 * Pide a YouTube la duración de los vídeos que aún no la tienen guardada, en lotes de 50. La duración no cambia,
 * así que cada vídeo se consulta una sola vez. Un directo en curso o programado devuelve 0: no se guarda, para
 * volver a mirarlo cuando acabe.
 */
export async function fillDurations(client: OAuth2Client, ids: string[]): Promise<void> {
  db.prepare("DELETE FROM video_durations WHERE fetched_at < ?").run(Date.now() - KEEP_MS);
  const known = cachedDurations(ids);
  const missing = ids.filter((id) => !known.has(id));
  const insert = db.prepare("INSERT OR REPLACE INTO video_durations (video_id, seconds, fetched_at) VALUES (?, ?, ?)");

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    let items: { id: string; contentDetails: { duration: string } }[] | undefined;
    try {
      const res = await client.request<{ items?: typeof items }>({
        url: `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&maxResults=${BATCH}&id=${batch.join(",")}`,
      });
      items = res.data.items;
    } catch (err) {
      const reason = (err as { response?: { data?: { error?: { errors?: { reason?: string }[] } } } }).response?.data?.error?.errors?.[0]
        ?.reason;
      if (reason === "quotaExceeded") throw new QuotaExceededError("Cuota diaria de la API de YouTube agotada");
      throw err;
    }
    const now = Date.now();
    for (const it of items ?? []) {
      const seconds = parseIsoDuration(it.contentDetails.duration);
      if (seconds && seconds > 0) insert.run(it.id, seconds, now);
    }
  }
}
