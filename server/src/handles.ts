import type { OAuth2Client } from "google-auth-library";
import { db } from "./db.js";

const BATCH = 50; // máximo de ids por consulta de channels.list (1 unidad de cuota por consulta)

/**
 * Completa el @handle de los canales que no lo tienen (suscritos y del catálogo). Las suscripciones de YouTube
 * no lo incluyen, así que se pide aparte, en lotes. Un canal sin handle (o que ya no existe) se anota con "" para
 * no volver a preguntar por él.
 */
export async function fillMissingHandles(client: OAuth2Client): Promise<void> {
  const column = (sql: string) => (db.prepare(sql).all() as { channel_id: string }[]).map((r) => r.channel_id);
  const ids = [
    ...new Set([
      ...column("SELECT channel_id FROM subscription_snapshot WHERE missing_since IS NULL AND handle IS NULL"),
      ...column("SELECT channel_id FROM catalog_channels WHERE handle IS NULL"),
    ]),
  ];
  const updateSnapshot = db.prepare("UPDATE subscription_snapshot SET handle = ? WHERE channel_id = ? AND handle IS NULL");
  const updateCatalog = db.prepare("UPDATE catalog_channels SET handle = ? WHERE channel_id = ? AND handle IS NULL");

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const res = await client.request<{ items?: { id: string; snippet: { customUrl?: string } }[] }>({
      url: `https://www.googleapis.com/youtube/v3/channels?part=snippet&maxResults=${BATCH}&id=${batch.join(",")}`,
    });
    const found = new Map((res.data.items ?? []).map((it) => [it.id, it.snippet.customUrl?.startsWith("@") ? it.snippet.customUrl : ""]));
    for (const id of batch) {
      const handle = found.get(id) ?? "";
      updateSnapshot.run(handle, id);
      updateCatalog.run(handle, id);
    }
  }
}

/** channel_id -> @handle de las suscripciones actuales que lo tienen. */
export function subscribedHandles(): Map<string, string> {
  const rows = db
    .prepare("SELECT channel_id, handle FROM subscription_snapshot WHERE missing_since IS NULL AND handle <> ''")
    .all() as { channel_id: string; handle: string }[];
  return new Map(rows.map((r) => [r.channel_id, r.handle]));
}
