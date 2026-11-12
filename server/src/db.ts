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

  -- Última lectura conocida de tus suscripciones. missing_since marca desde cuándo falta un canal
  -- en lecturas consecutivas; sirve para distinguir una baja real de un fallo puntual de YouTube.
  CREATE TABLE IF NOT EXISTS subscription_snapshot (
    channel_id    TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    first_seen    INTEGER NOT NULL,
    last_seen     INTEGER NOT NULL,
    missing_since INTEGER
  );

  -- Catálogo: canales conocidos a los que NO estoy suscrito. source: 'baja' (me di de baja y la app
  -- lo detectó) o 'import' (añadido a mano o importado de una lista). Al volver a suscribirme se quita.
  CREATE TABLE IF NOT EXISTS catalog_channels (
    channel_id TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    handle     TEXT,
    added_at   INTEGER NOT NULL,
    source     TEXT NOT NULL DEFAULT 'import',
    list_id    TEXT   -- lista en la que estaba al darme de baja; al volver a suscribirme vuelve a ella
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

// La tabla del catálogo se creó antes sin las columnas source y list_id: se añaden a las bases de datos existentes.
const catalogColumns = db.prepare("PRAGMA table_info(catalog_channels)").all() as unknown as { name: string }[];
if (!catalogColumns.some((c) => c.name === "source")) {
  db.exec("ALTER TABLE catalog_channels ADD COLUMN source TEXT NOT NULL DEFAULT 'import'");
}
if (!catalogColumns.some((c) => c.name === "list_id")) {
  db.exec("ALTER TABLE catalog_channels ADD COLUMN list_id TEXT");
}

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
