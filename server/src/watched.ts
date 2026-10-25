import { db } from "./db.js";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const VIDEO_ID = /^[\w-]{11}$/;

export function isVideoId(value: string): boolean {
  return VIDEO_ID.test(value);
}

function purgeExpired(): void {
  db.prepare("DELETE FROM watched WHERE watched_at < ?").run(Date.now() - RETENTION_MS);
}

export function listWatched(): string[] {
  purgeExpired();
  const rows = db.prepare("SELECT video_id FROM watched").all() as { video_id: string }[];
  return rows.map((r) => r.video_id);
}

export function unmarkWatched(videoId: string): void {
  db.prepare("DELETE FROM watched WHERE video_id = ?").run(videoId);
}

/** Marca como visto; si ya lo estaba, renueva la fecha y vuelve a empezar la semana. */
export function markWatched(videoId: string): void {
  purgeExpired();
  db.prepare(
    `INSERT INTO watched (video_id, watched_at) VALUES (?, ?)
     ON CONFLICT(video_id) DO UPDATE SET watched_at = excluded.watched_at`,
  ).run(videoId, Date.now());
}
