import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db } from "./db.js";

const run = promisify(execFile);

const YT_DLP = process.env.YT_DLP_PATH ?? "yt-dlp";
const CACHE_MS = 30 * 24 * 60 * 60 * 1000;
// El cliente por defecto de yt-dlp falla a veces con "The page needs to be reloaded".
const PLAYER_CLIENT = process.env.YT_DLP_PLAYER_CLIENT ?? "android_vr";

export interface Transcript {
  videoId: string;
  text: string;
  lang: string;
}

/** yt-dlp no está instalado: afecta a todos los vídeos, no a uno concreto. */
export class YtDlpMissingError extends Error {}

/** El vídeo no tiene transcripción disponible o no se pudo descargar. */
export class NoTranscriptError extends Error {}

interface Json3 {
  events?: { segs?: { utf8?: string }[] }[];
}

interface CaptionTrack {
  ext: string;
  url: string;
}

interface VideoInfo {
  language?: string;
  subtitles?: Record<string, CaptionTrack[]>;
  automatic_captions?: Record<string, CaptionTrack[]>;
}

function json3ToText(data: Json3): string {
  const parts = (data.events ?? []).map((e) => (e.segs ?? []).map((s) => s.utf8 ?? "").join(""));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Elige la pista de subtítulos: manual en el idioma del vídeo, luego los
 * auto-subtítulos originales ("xx-orig") de ese idioma, y por último español o inglés.
 */
function pickTrack(info: VideoInfo): { lang: string; url: string } | undefined {
  const base = info.language?.split("-")[0];
  const manual = info.subtitles ?? {};
  const auto = info.automatic_captions ?? {};
  const candidates: [Record<string, CaptionTrack[]>, string][] = [
    ...(base ? ([[manual, base], [auto, `${base}-orig`], [auto, base]] as [Record<string, CaptionTrack[]>, string][]) : []),
    [manual, "es"], [manual, "en"],
    [auto, "es-orig"], [auto, "en-orig"],
    [auto, "es"], [auto, "en"],
  ];
  for (const [source, lang] of candidates) {
    const track = source[lang]?.find((t) => t.ext === "json3");
    if (track) return { lang, url: track.url };
  }
  return undefined;
}

async function downloadTranscript(videoId: string): Promise<Transcript> {
  let info: VideoInfo;
  try {
    const { stdout } = await run(
      YT_DLP,
      [
        "--extractor-args", `youtube:player_client=${PLAYER_CLIENT}`,
        "--skip-download",
        "--dump-single-json",
        "--no-warnings",
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { timeout: 90_000, maxBuffer: 50 * 1024 * 1024 },
    );
    info = JSON.parse(stdout) as VideoInfo;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new YtDlpMissingError("yt-dlp no está instalado (brew install yt-dlp)");
    }
    const stderr = String((err as { stderr?: string }).stderr ?? "");
    const reason = stderr.split("\n").find((l) => l.startsWith("ERROR")) ?? (err as Error).message.split("\n")[0];
    throw new NoTranscriptError(`no se pudo leer el vídeo: ${reason}`);
  }

  const track = pickTrack(info);
  if (!track) throw new NoTranscriptError("el vídeo no tiene subtítulos");

  const res = await fetch(track.url);
  if (!res.ok) throw new NoTranscriptError(`YouTube rechazó la descarga de subtítulos (HTTP ${res.status})`);

  const text = json3ToText((await res.json()) as Json3);
  if (!text) throw new NoTranscriptError("la transcripción está vacía");
  return { videoId, text, lang: track.lang };
}

export async function getTranscript(videoId: string): Promise<Transcript> {
  db.prepare("DELETE FROM transcripts WHERE fetched_at < ?").run(Date.now() - CACHE_MS);

  const hit = db.prepare("SELECT text, lang FROM transcripts WHERE video_id = ?").get(videoId) as
    | { text: string; lang: string }
    | undefined;
  if (hit) return { videoId, ...hit };

  const t = await downloadTranscript(videoId);
  db.prepare("INSERT OR REPLACE INTO transcripts (video_id, text, lang, fetched_at) VALUES (?, ?, ?, ?)").run(
    videoId,
    t.text,
    t.lang,
    Date.now(),
  );
  return t;
}
