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
}

export interface PendingChannel extends ChannelRef {
  /** Desde cuándo se podrá quitar de las listas si sigue ausente. */
  confirmAfter: number;
}

export interface ReconcileResult {
  /** Canales quitados de las listas en esta lectura. */
  removed: ChannelRef[];
  /** Canales ausentes que siguen en las listas esperando confirmación. */
  pending: PendingChannel[];
}

interface Row {
  channel_id: string;
  title: string;
  missing_since: number | null;
}

/**
 * Compara las suscripciones actuales con la última lectura y quita de las listas los canales dados de baja.
 *
 * - Pocas bajas: se quitan de las listas al momento.
 * - Muchas bajas a la vez (posible fallo de YouTube): solo se quitan si el canal sigue ausente en una lectura
 *   posterior, al menos CONFIRM_AFTER_MS después de la primera en que faltó. Si reaparece entre medias,
 *   la cuenta empieza de nuevo.
 * - Una respuesta vacía se ignora: es casi seguro un fallo.
 *
 * `now` es un parámetro para poder probarlo sin esperar.
 */
export function reconcileSubscriptions(current: ChannelRef[], now = Date.now()): ReconcileResult {
  if (current.length === 0) return { removed: [], pending: [] };

  return transaction(() => {
    const presentIds = new Set(current.map((c) => c.channelId));
    const previous = db.prepare("SELECT channel_id, title, missing_since FROM subscription_snapshot").all() as unknown as Row[];
    const inLists = new Set(
      (db.prepare("SELECT channel_id FROM list_channels").all() as { channel_id: string }[]).map((r) => r.channel_id),
    );

    const known = new Set(previous.map((r) => r.channel_id));
    const knownActive = previous.filter((r) => r.missing_since === null).length;

    // Ausentes ahora: los del histórico que no vienen, y canales en listas que nunca llegaron a estar en él.
    const absent: Row[] = previous.filter((r) => !presentIds.has(r.channel_id));
    for (const id of inLists) {
      if (!presentIds.has(id) && !known.has(id)) absent.push({ channel_id: id, title: id, missing_since: null });
    }

    const newlyAbsent = absent.filter((r) => r.missing_since === null).length;
    const mass = newlyAbsent > Math.max(MASS_MIN, Math.ceil(knownActive * MASS_FRACTION));

    const upsert = db.prepare(
      `INSERT INTO subscription_snapshot (channel_id, title, first_seen, last_seen, missing_since)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT(channel_id) DO UPDATE SET title = excluded.title, last_seen = excluded.last_seen, missing_since = NULL`,
    );
    for (const c of current) upsert.run(c.channelId, c.title, now, now);

    const markMissing = db.prepare(
      `INSERT INTO subscription_snapshot (channel_id, title, first_seen, last_seen, missing_since)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(channel_id) DO UPDATE SET missing_since = COALESCE(missing_since, excluded.missing_since)`,
    );
    const dropFromLists = db.prepare("DELETE FROM list_channels WHERE channel_id = ?");

    const removed: ChannelRef[] = [];
    const pending: PendingChannel[] = [];
    for (const row of absent) {
      markMissing.run(row.channel_id, row.title, now, now, now);
      if (!inLists.has(row.channel_id)) continue;

      const isNew = row.missing_since === null;
      const confirmed = !isNew && now - row.missing_since! >= CONFIRM_AFTER_MS;
      const ref = { channelId: row.channel_id, title: row.title };
      if ((isNew && !mass) || confirmed) {
        dropFromLists.run(row.channel_id);
        removed.push(ref);
      } else {
        pending.push({ ...ref, confirmAfter: (row.missing_since ?? now) + CONFIRM_AFTER_MS });
      }
    }

    db.prepare("DELETE FROM subscription_snapshot WHERE missing_since IS NOT NULL AND missing_since < ?").run(
      now - FORGET_AFTER_MS,
    );
    return { removed, pending };
  });
}

/** Quita ya de las listas todos los canales que faltan en la última lectura, sin esperar la confirmación. */
export function removeMissingNow(): ChannelRef[] {
  return transaction(() => {
    const rows = db
      .prepare(
        `SELECT s.channel_id, s.title FROM subscription_snapshot s
         JOIN list_channels l ON l.channel_id = s.channel_id
         WHERE s.missing_since IS NOT NULL`,
      )
      .all() as { channel_id: string; title: string }[];
    const drop = db.prepare("DELETE FROM list_channels WHERE channel_id = ?");
    for (const r of rows) drop.run(r.channel_id);
    return rows.map((r) => ({ channelId: r.channel_id, title: r.title }));
  });
}
