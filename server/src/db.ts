import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../data");
mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(join(DATA_DIR, "yt-player.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS lists (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    position INTEGER NOT NULL
  );

  -- La clave primaria es el canal: un canal solo puede estar en una lista.
  CREATE TABLE IF NOT EXISTS list_channels (
    channel_id TEXT PRIMARY KEY,
    list_id    TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    position   INTEGER NOT NULL
  );

  -- Vídeos reproducidos en la app; se purgan a la semana (ver watched.ts).
  CREATE TABLE IF NOT EXISTS watched (
    video_id   TEXT PRIMARY KEY,
    watched_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS watched_at_idx ON watched(watched_at);
`);

/** Ejecuta fn dentro de una transacción; revierte si lanza. */
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
