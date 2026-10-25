import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db.js";
import { getTranscript, NoTranscriptError, type Transcript } from "./transcripts.js";

const MODEL = "claude-haiku-5-5";
// Precios de Haiku 5.5 (USD por millón de tokens) para peticiones de hasta 100K tokens.
// Por encima de ese tamaño el precio sube, por eso se limita el texto de entrada.
const PRICE_IN = 0.1;
const PRICE_OUT = 0.5;
// ~3,5 caracteres por token en español: 300K caracteres quedan por debajo de los 100K tokens.
const MAX_INPUT_CHARS = 300_000;
const MAX_VIDEOS = 20;
const CONCURRENCY = 3;
const SUMMARY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface VideoRef {
  videoId: string;
  title: string;
  channelTitle: string;
}

export interface SummaryContent {
  text: string;
  /** Vídeos incluidos, en el orden en que se numeran en el resumen ([1], [2]…). */
  included: VideoRef[];
  skipped: { video: VideoRef; reason: string }[];
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}

export interface SummaryResult extends SummaryContent {
  id: number;
  createdAt: number;
}

/** Error con un mensaje apto para mostrar al usuario y el código HTTP que le corresponde. */
export class SummaryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const SYSTEM_PROMPT = `Resumes vídeos de YouTube a partir de sus transcripciones automáticas, que pueden tener errores de reconocimiento de voz: corrígelos por el contexto. El usuario tiene poco tiempo y quiere saber de un vistazo qué dice cada cosa, no una explicación.

Sé brutalmente conciso:
- Un solo vídeo: de 3 a 5 viñetas. Varios vídeos: unas 2 viñetas por vídeo como máximo, y menos si se repiten.
- Cada viñeta, UNA frase corta (unas 20 palabras como mucho) con el dato, la cifra, la decisión o la conclusión. Nada de contexto, matices ni explicaciones.
- Omite saludos, presentaciones, promociones, peticiones de suscripción, relleno y lo que cualquiera ya sabe.
- Sin introducción, sin conclusión final y sin repetir el título.
- Si varios vídeos tratan lo mismo, cuenta el punto una sola vez e indica al final de la viñeta los vídeos que lo cubren, por ejemplo [1, 4]. Con un solo vídeo no pongas referencias.
- Solo si hay varios temas claramente distintos, agrúpalos bajo "## Tema" (con 1 a 3 viñetas cada uno); si no, una lista plana.
- Si algo es opinión o especulación del autor, dilo en dos palabras.
- No añadas nada que no esté en las transcripciones.
- Escribe en español, en Markdown simple (viñetas "- "). Usa **negrita** solo para el dato clave de la viñeta.`;

export function parseVideoRefs(input: unknown): VideoRef[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_VIDEOS) return null;
  const refs: VideoRef[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) return null;
    const { videoId, title, channelTitle } = raw as Record<string, unknown>;
    if (typeof videoId !== "string" || !/^[\w-]{11}$/.test(videoId)) return null;
    refs.push({
      videoId,
      title: typeof title === "string" ? title : "",
      channelTitle: typeof channelTitle === "string" ? channelTitle : "",
    });
  }
  return refs;
}

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

const attr = (s: string) => s.replace(/["<>&]/g, " ");

const inFlight = new Map<string, Promise<SummaryResult>>();

/** Peticiones idénticas simultáneas (doble clic, dos pestañas) comparten una sola llamada a la API. */
export function summarize(videos: VideoRef[]): Promise<SummaryResult> {
  const key = videos.map((v) => v.videoId).sort().join(",");
  const running = inFlight.get(key);
  if (running) return running;

  const promise = doSummarize(videos).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function doSummarize(videos: VideoRef[]): Promise<SummaryResult> {
  type Fetched = { video: VideoRef; transcript: Transcript } | { video: VideoRef; error: string };

  const fetched = await mapLimit<VideoRef, Fetched>(videos, CONCURRENCY, async (video) => {
    try {
      return { video, transcript: await getTranscript(video.videoId) };
    } catch (err) {
      if (err instanceof NoTranscriptError) return { video, error: err.message };
      throw err; // yt-dlp ausente u otro fallo que afecta a todos
    }
  });

  const ok: { video: VideoRef; transcript: Transcript }[] = [];
  const skipped: SummaryContent["skipped"] = [];
  for (const f of fetched) {
    if ("transcript" in f) ok.push(f);
    else skipped.push({ video: f.video, reason: f.error });
  }

  if (ok.length === 0) {
    throw new SummaryError("Ninguno de los vídeos seleccionados tiene transcripción disponible.", 422);
  }

  const totalChars = ok.reduce((n, o) => n + o.transcript.text.length, 0);
  if (totalChars > MAX_INPUT_CHARS) {
    throw new SummaryError(
      `Hay demasiado texto (${Math.round(totalChars / 1000)}K caracteres, el máximo es ${MAX_INPUT_CHARS / 1000}K). Selecciona menos vídeos o más cortos.`,
      413,
    );
  }

  const content = ok
    .map(
      (o, i) =>
        `<video n="${i + 1}" titulo="${attr(o.video.title)}" canal="${attr(o.video.channelTitle)}">\n${o.transcript.text}\n</video>`,
    )
    .join("\n\n");

  const client = new Anthropic();
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Resume estos ${ok.length} vídeos:\n\n${content}` }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new SummaryError("La clave de la API de Anthropic no es válida (revisa ANTHROPIC_API_KEY en .env).", 503);
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new SummaryError("Límite de la API alcanzado; prueba de nuevo en un minuto.", 429);
    }
    if (err instanceof Anthropic.APIError) {
      throw new SummaryError(`Error de la API de Anthropic (${err.status}): ${err.message}`, 502);
    }
    throw new SummaryError(
      "No se pudo llamar a la API de Anthropic. ¿Está ANTHROPIC_API_KEY en .env?",
      503,
    );
  }

  if (response.stop_reason === "refusal") {
    throw new SummaryError("El modelo ha rechazado resumir este contenido.", 422);
  }
  if (response.stop_reason === "max_tokens") {
    throw new SummaryError("El resumen se cortó por longitud; selecciona menos vídeos.", 422);
  }

  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd = (inputTokens * PRICE_IN + outputTokens * PRICE_OUT) / 1_000_000;

  db.prepare(
    "INSERT INTO usage (at, videos, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, ?)",
  ).run(Date.now(), ok.length, inputTokens, outputTokens, costUsd);

  return saveSummary({
    text,
    included: ok.map((o) => o.video),
    skipped,
    usage: { inputTokens, outputTokens, costUsd },
  });
}

/** Gasto acumulado en el mes natural en curso. */
export function monthUsage(): { summaries: number; costUsd: number } {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const row = db
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(cost_usd), 0) AS cost FROM usage WHERE at >= ?")
    .get(start.getTime()) as { n: number; cost: number };
  return { summaries: row.n, costUsd: row.cost };
}

function purgeSummaries(): void {
  db.prepare("DELETE FROM summaries WHERE created_at < ?").run(Date.now() - SUMMARY_RETENTION_MS);
}

function saveSummary(content: SummaryContent): SummaryResult {
  purgeSummaries();
  const createdAt = Date.now();
  const { lastInsertRowid } = db
    .prepare("INSERT INTO summaries (created_at, result_json) VALUES (?, ?)")
    .run(createdAt, JSON.stringify(content));
  return { ...content, id: Number(lastInsertRowid), createdAt };
}

/** Resúmenes guardados, del más reciente al más antiguo. */
export function listSummaries(): SummaryResult[] {
  purgeSummaries();
  const rows = db.prepare("SELECT id, created_at, result_json FROM summaries ORDER BY id DESC").all() as {
    id: number;
    created_at: number;
    result_json: string;
  }[];
  return rows.map((r) => ({ ...(JSON.parse(r.result_json) as SummaryContent), id: r.id, createdAt: r.created_at }));
}

/** Para cada vídeo resumido, el id de su resumen más reciente. */
export function summarizedMap(): Record<string, number> {
  const map: Record<string, number> = {};
  for (const summary of listSummaries()) {
    for (const v of summary.included) map[v.videoId] ??= summary.id; // el primero que aparece es el más reciente
  }
  return map;
}
