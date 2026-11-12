import { db, transaction } from "./db.js";

/** Tiempo que un canal debe seguir ausente, entre dos lecturas, para darlo de baja cuando son muchas. */
export const CONFIRM_AFTER_MS = 30 * 60 * 1000;
// Una baja se considera "masiva" si supera el 20 % de las suscripciones conocidas (y al menos 5 canales).
const MASS_MIN = 5;
const MASS_FRACTION = 0.2;
// Los canales ausentes desde hace tanto se olvidan del histórico.
const FORGET_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

export interface ChannelRef {
  channelId: string;
  title: string;
  /** Foto del canal, si se conoce. */
  thumbnail?: string | null;
}

export interface PendingChannel extends ChannelRef {
  /** Desde cuándo se podrá quitar de las listas si sigue ausente. */
  confirmAfter: number;
}

export interface RestoredChannel extends ChannelRef {
  /** Nombre de la lista a la que ha vuelto. */
  listName: string;
}

export interface ReconcileResult {
  /** Canales quitados de sus listas en esta lectura. */
  removed: ChannelRef[];
  /** Canales que han pasado al catálogo en esta lectura (incluye los de `removed` y los que no estaban en ninguna lista). */
  catalogued: ChannelRef[];
  /** Canales a los que te has vuelto a suscribir y que han vuelto a la lista en la que estaban. */
  restored: RestoredChannel[];
  /** Canales ausentes que siguen en las listas esperando confirmación. */
  pending: PendingChannel[];
}

interface Row {
  channel_id: string;
  title: string;
  missing_since: number | null;
  thumbnail: string | null;
  handle: string | null;
}

/** channel_id -> id de la lista en la que está. */
function channelsInLists(): Map<string, string> {
  const rows = db.prepare("SELECT channel_id, list_id FROM list_channels").all() as { channel_id: string; list_id: string }[];
  return new Map(rows.map((r) => [r.channel_id, r.list_id]));
}

const INSERT_BAJA =
  "INSERT OR IGNORE INTO catalog_channels (channel_id, title, handle, added_at, source, list_id, thumbnail) VALUES (?, ?, ?, ?, 'baja', ?, ?)";

/**
 * Compara las suscripciones actuales con la última lectura. Los canales dados de baja pasan al catálogo
 * (recordando su lista) y salen de ella; los que vuelven a estar suscritos salen del catálogo y vuelven a su lista.
 *
 * - Pocas bajas: se aplican al momento.
 * - Muchas bajas a la vez (posible fallo de YouTube): solo se aplican si el canal sigue ausente en una lectura
 *   posterior, al menos CONFIRM_AFTER_MS después de la primera en que faltó. Si reaparece entre medias,
 *   la cuenta empieza de nuevo.
 * - Una respuesta vacía se ignora: es casi seguro un fallo.
 *
 * `now` es un parámetro para poder probarlo sin esperar.
 */
export function reconcileSubscriptions(current: ChannelRef[], now = Date.now()): ReconcileResult {
  if (current.length === 0) return { removed: [], catalogued: [], restored: [], pending: [] };

  return transaction(() => {
    const presentIds = new Set(current.map((c) => c.channelId));
    const previous = db.prepare("SELECT channel_id, title, missing_since, thumbnail, handle FROM subscription_snapshot").all() as unknown as Row[];
    const inLists = channelsInLists();

    const known = new Set(previous.map((r) => r.channel_id));
    const knownActive = previous.filter((r) => r.missing_since === null).length;

    // Ausentes ahora: los del histórico que no vienen, y canales en listas que nunca llegaron a estar en él.
    const absent: Row[] = previous.filter((r) => !presentIds.has(r.channel_id));
    for (const id of inLists.keys()) {
      if (!presentIds.has(id) && !known.has(id)) absent.push({ channel_id: id, title: id, missing_since: null, thumbnail: null, handle: null });
    }

    const newlyAbsent = absent.filter((r) => r.missing_since === null).length;
    const mass = newlyAbsent > Math.max(MASS_MIN, Math.ceil(knownActive * MASS_FRACTION));

    const upsert = db.prepare(
      `INSERT INTO subscription_snapshot (channel_id, title, first_seen, last_seen, missing_since, thumbnail)
       VALUES (?, ?, ?, ?, NULL, ?)
       ON CONFLICT(channel_id) DO UPDATE SET title = excluded.title, last_seen = excluded.last_seen, missing_since = NULL,
         thumbnail = COALESCE(excluded.thumbnail, thumbnail)`,
    );
    for (const c of current) upsert.run(c.channelId, c.title, now, now, c.thumbnail ?? null);

    // Un canal al que estás suscrito no puede estar en el catálogo: sale de él y, si venía de una lista que
    // sigue existiendo, vuelve a ella (al final).
    const restored: RestoredChannel[] = [];
    const catalogRow = db.prepare("SELECT list_id FROM catalog_channels WHERE channel_id = ?");
    const listName = db.prepare("SELECT name FROM lists WHERE id = ?");
    const nextPosition = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM list_channels WHERE list_id = ?");
    const addToList = db.prepare("INSERT INTO list_channels (channel_id, list_id, position) VALUES (?, ?, ?)");
    const leaveCatalog = db.prepare("DELETE FROM catalog_channels WHERE channel_id = ?");
    for (const c of current) {
      const row = catalogRow.get(c.channelId) as unknown as { list_id: string | null } | undefined;
      if (!row) continue;
      if (row.list_id && !inLists.has(c.channelId)) {
        const list = listName.get(row.list_id) as unknown as { name: string } | undefined;
        if (list) {
          const { p } = nextPosition.get(row.list_id) as unknown as { p: number };
          addToList.run(c.channelId, row.list_id, p);
          restored.push({ channelId: c.channelId, title: c.title, listName: list.name });
        }
      }
      leaveCatalog.run(c.channelId);
    }

    const markMissing = db.prepare(
      `INSERT INTO subscription_snapshot (channel_id, title, first_seen, last_seen, missing_since)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(channel_id) DO UPDATE SET missing_since = COALESCE(missing_since, excluded.missing_since)`,
    );
    const dropFromLists = db.prepare("DELETE FROM list_channels WHERE channel_id = ?");
    const toCatalog = db.prepare(INSERT_BAJA);

    const removed: ChannelRef[] = [];
    const catalogued: ChannelRef[] = [];
    const pending: PendingChannel[] = [];
    for (const row of absent) {
      markMissing.run(row.channel_id, row.title, now, now, now);

      const isNew = row.missing_since === null;
      const confirmed = !isNew && now - row.missing_since! >= CONFIRM_AFTER_MS;
      const listId = inLists.get(row.channel_id) ?? null;
      const ref = { channelId: row.channel_id, title: row.title };

      if ((isNew && !mass) || confirmed) {
        // Baja confirmada: pasa al catálogo (esté o no en una lista, que se recuerda) y sale de su lista.
        if (Number(toCatalog.run(row.channel_id, row.title, row.handle || null, now, listId, row.thumbnail).changes) > 0) catalogued.push(ref);
        if (listId) {
          dropFromLists.run(row.channel_id);
          removed.push(ref);
        }
      } else if (listId) {
        pending.push({ ...ref, confirmAfter: (row.missing_since ?? now) + CONFIRM_AFTER_MS });
      }
    }

    db.prepare("DELETE FROM subscription_snapshot WHERE missing_since IS NOT NULL AND missing_since < ?").run(
      now - FORGET_AFTER_MS,
    );
    return { removed, catalogued, restored, pending };
  });
}

/** Confirma ya todas las bajas pendientes: los canales que faltan pasan al catálogo y salen de sus listas. */
export function removeMissingNow(): { removed: ChannelRef[]; catalogued: ChannelRef[] } {
  return transaction(() => {
    const missing = db
      .prepare("SELECT channel_id, title, thumbnail, handle FROM subscription_snapshot WHERE missing_since IS NOT NULL")
      .all() as { channel_id: string; title: string; thumbnail: string | null; handle: string | null }[];
    const inLists = channelsInLists();
    const toCatalog = db.prepare(INSERT_BAJA);
    const dropFromLists = db.prepare("DELETE FROM list_channels WHERE channel_id = ?");

    const removed: ChannelRef[] = [];
    const catalogued: ChannelRef[] = [];
    for (const r of missing) {
      const ref = { channelId: r.channel_id, title: r.title };
      const listId = inLists.get(r.channel_id) ?? null;
      if (Number(toCatalog.run(r.channel_id, r.title, r.handle || null, Date.now(), listId, r.thumbnail).changes) > 0) catalogued.push(ref);
      if (listId) {
        dropFromLists.run(r.channel_id);
        removed.push(ref);
      }
    }
    return { removed, catalogued };
  });
}
