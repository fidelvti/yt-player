import type { OAuth2Client } from "google-auth-library";
import { isAuthExpired } from "./auth.js";
import { db } from "./db.js";

export interface CatalogChannel {
  channelId: string;
  title: string;
  handle: string | null;
  addedAt: number;
  /** 'baja': te diste de baja y la app lo detectó; 'import': añadido a mano o importado. */
  source: "baja" | "import";
  /** Lista a la que volverá si te suscribes de nuevo (null si no estaba en ninguna o ya no existe). */
  listName: string | null;
  /** Foto del canal (null si aún no se conoce). */
  thumbnail: string | null;
}

export function listCatalog(): CatalogChannel[] {
  const rows = db
    .prepare(
      `SELECT c.channel_id, c.title, c.handle, c.added_at, c.source, c.thumbnail, l.name AS list_name
       FROM catalog_channels c LEFT JOIN lists l ON l.id = c.list_id
       ORDER BY c.title COLLATE NOCASE`,
    )
    .all() as unknown as {
    channel_id: string;
    title: string;
    handle: string | null;
    added_at: number;
    source: string;
    thumbnail: string | null;
    list_name: string | null;
  }[];
  return rows.map((r) => ({
    channelId: r.channel_id,
    title: r.title,
    handle: r.handle,
    addedAt: r.added_at,
    source: r.source === "baja" ? "baja" : "import",
    listName: r.list_name,
    thumbnail: r.thumbnail,
  }));
}

export function isChannelId(value: string): boolean {
  return /^UC[\w-]{22}$/.test(value);
}

export function removeFromCatalog(channelId: string): void {
  db.prepare("DELETE FROM catalog_channels WHERE channel_id = ?").run(channelId);
}

// ---------- Añadir canales a partir de una URL o un @handle ----------

export type ChannelQuery =
  | { kind: "id"; value: string }
  | { kind: "handle"; value: string } // sin la @
  | { kind: "username"; value: string } // /user/nombre (formato antiguo)
  | { kind: "custom"; value: string }; // /c/nombre (URL personalizada antigua): se intenta como handle

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Interpreta lo que pega el usuario: una URL de canal (`/@handle`, `/channel/UC…`, `/user/…`, `/c/…`),
 * un `@handle`, un id `UC…` o un nombre suelto (se toma como handle). Devuelve null si no parece un canal.
 */
export function parseChannelInput(raw: string): ChannelQuery | null {
  const text = raw.trim();
  if (!text) return null;
  if (isChannelId(text)) return { kind: "id", value: text };
  if (text.startsWith("@")) {
    const handle = decode(text.slice(1));
    return /^[^\s/?#]+$/.test(handle) ? { kind: "handle", value: handle } : null;
  }

  if (/youtube\.com|^https?:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
      return null;
    }
    if (!/(^|\.)youtube\.com$/i.test(url.hostname)) return null;
    const [first, second] = url.pathname.split("/").filter(Boolean).map(decode);
    if (!first) return null;
    if (first.startsWith("@") && first.length > 1) return { kind: "handle", value: first.slice(1) };
    if (first === "channel" && second && isChannelId(second)) return { kind: "id", value: second };
    if (first === "user" && second) return { kind: "username", value: second };
    if (first === "c" && second) return { kind: "custom", value: second };
    return null; // vídeos, listas, etc.
  }

  return /^[^\s/:?#]+$/.test(text) ? { kind: "handle", value: decode(text) } : null;
}

interface ChannelsResponse {
  items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } } }[];
}

export interface ResolvedChannel {
  channelId: string;
  title: string;
  handle: string | null;
  thumbnail: string | null;
}

/** Busca el canal en la API de YouTube (solo lectura, 1 unidad de cuota). Devuelve null si no existe. */
export async function resolveChannel(client: OAuth2Client, query: ChannelQuery): Promise<ResolvedChannel | null> {
  const param =
    query.kind === "id"
      ? `id=${encodeURIComponent(query.value)}`
      : query.kind === "username"
        ? `forUsername=${encodeURIComponent(query.value)}`
        : `forHandle=${encodeURIComponent("@" + query.value)}`;
  const res = await client.request<ChannelsResponse>({
    url: `https://www.googleapis.com/youtube/v3/channels?part=snippet&${param}`,
  });
  const item = res.data.items?.[0];
  if (!item) return null;
  const custom = item.snippet.customUrl;
  return {
    channelId: item.id,
    title: item.snippet.title,
    handle: custom?.startsWith("@") ? custom : null,
    thumbnail: item.snippet.thumbnails?.default?.url ?? null,
  };
}

export type AddStatus = "added" | "in_catalog" | "subscribed" | "not_found" | "unsupported" | "error";

export interface AddResult {
  input: string;
  status: AddStatus;
  channel?: ResolvedChannel;
}

const MAX_INPUTS = 50;

/** Separa lo pegado en elementos (uno por línea, o separados por espacios o comas). */
export function splitInputs(text: string): string[] {
  return text.split(/[\s,;]+/).filter(Boolean).slice(0, MAX_INPUTS);
}

/** Añade al catálogo los canales indicados por URL o @handle. Cada elemento se resuelve por separado. */
export async function addToCatalog(client: OAuth2Client, text: string): Promise<AddResult[]> {
  const results: AddResult[] = [];
  const seen = new Set<string>();
  const isSubscribed = db.prepare("SELECT 1 FROM subscription_snapshot WHERE channel_id = ? AND missing_since IS NULL");
  const inCatalog = db.prepare("SELECT 1 FROM catalog_channels WHERE channel_id = ?");
  const insert = db.prepare(
    "INSERT OR IGNORE INTO catalog_channels (channel_id, title, handle, added_at, source, list_id, thumbnail) VALUES (?, ?, ?, ?, 'import', NULL, ?)",
  );
  const fillThumbnail = db.prepare("UPDATE catalog_channels SET thumbnail = COALESCE(thumbnail, ?) WHERE channel_id = ?");

  for (const input of splitInputs(text)) {
    const query = parseChannelInput(input);
    if (!query) {
      results.push({ input, status: "unsupported" });
      continue;
    }
    let channel: ResolvedChannel | null;
    try {
      channel = await resolveChannel(client, query);
    } catch (err) {
      // Una sesión caducada afecta a todo: se propaga para que la ruta lo gestione.
      if (isAuthExpired(err)) throw err;
      results.push({ input, status: "error" });
      continue;
    }
    if (!channel) {
      results.push({ input, status: query.kind === "custom" ? "unsupported" : "not_found" });
      continue;
    }
    if (seen.has(channel.channelId)) continue; // el mismo canal pegado dos veces
    seen.add(channel.channelId);

    if (isSubscribed.get(channel.channelId)) results.push({ input, status: "subscribed", channel });
    else if (inCatalog.get(channel.channelId)) {
      fillThumbnail.run(channel.thumbnail, channel.channelId); // vuelve a pasar: aprovecha para completar la foto
      results.push({ input, status: "in_catalog", channel });
    }
    else {
      insert.run(channel.channelId, channel.title, channel.handle, Date.now(), channel.thumbnail);
      results.push({ input, status: "added", channel });
    }
  }
  return results;
}
