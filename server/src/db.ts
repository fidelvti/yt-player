import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// YT_PLAYER_DATA permite usar otra carpeta de datos (p. ej. para pruebas sin tocar las listas reales).
export const DATA_DIR = process.env.YT_PLAYER_DATA ?? join(dirname(fileURLToPath(import.meta.url)), "../../data");
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

  -- Sustituida por summaries (que guarda el texto, no solo la marca).
  DROP TABLE IF EXISTS summarized;

  -- Resúmenes generados, con su texto, vídeos incluidos y coste; se purgan a los 30 días.
  CREATE TABLE IF NOT EXISTS summaries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  INTEGER NOT NULL,
    result_json TEXT NOT NULL
  );

  -- Caché de transcripciones (se descargan una sola vez por vídeo).
  CREATE TABLE IF NOT EXISTS transcripts (
    video_id   TEXT PRIMARY KEY,
    text       TEXT NOT NULL,
    lang       TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  -- Un registro por resumen generado, para saber cuánto se gasta.
  CREATE TABLE IF NOT EXISTS usage (
    at            INTEGER NOT NULL,
    videos        INTEGER NOT NULL,
    input_tokens  INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd      REAL NOT NULL
  );
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
