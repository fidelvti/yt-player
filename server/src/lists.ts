import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, db, transaction } from "./db.js";

export interface ChannelList {
  id: string;
  name: string;
  channelIds: string[];
}

export async function loadLists(): Promise<ChannelList[]> {
  const lists = db.prepare("SELECT id, name FROM lists ORDER BY position").all() as {
    id: string;
    name: string;
  }[];
  const channels = db
    .prepare("SELECT list_id, channel_id FROM list_channels ORDER BY position")
    .all() as { list_id: string; channel_id: string }[];

  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    channelIds: channels.filter((c) => c.list_id === l.id).map((c) => c.channel_id),
  }));
}

/** Valida la forma y que ningún canal esté en más de una lista. */
export function parseLists(input: unknown): ChannelList[] | null {
  if (!Array.isArray(input)) return null;
  const seenChannels = new Set<string>();
  const seenIds = new Set<string>();
  const lists: ChannelList[] = [];

  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) return null;
    const { id, name, channelIds } = raw as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string" || !name.trim()) return null;
    if (!Array.isArray(channelIds) || !channelIds.every((c) => typeof c === "string")) return null;
    if (seenIds.has(id)) return null;
    seenIds.add(id);
    for (const c of channelIds as string[]) {
      if (seenChannels.has(c)) return null;
      seenChannels.add(c);
    }
    lists.push({ id, name: name.trim(), channelIds: channelIds as string[] });
  }
  return lists;
}

/** Sustituye todas las listas por las recibidas, de forma atómica. */
function writeLists(lists: ChannelList[]): void {
  transaction(() => {
    db.exec("DELETE FROM list_channels; DELETE FROM lists;");
    const insertList = db.prepare("INSERT INTO lists (id, name, position) VALUES (?, ?, ?)");
    const insertChannel = db.prepare(
      "INSERT INTO list_channels (channel_id, list_id, position) VALUES (?, ?, ?)",
    );
    lists.forEach((l, i) => {
      insertList.run(l.id, l.name, i);
      l.channelIds.forEach((c, j) => insertChannel.run(c, l.id, j));
    });
  });
}

export async function saveLists(lists: ChannelList[]): Promise<void> {
  writeLists(lists);
}

/** Importa data/lists.json (formato anterior) la primera vez y lo aparta para no reimportarlo. */
function importLegacyJson(): void {
  const legacy = join(DATA_DIR, "lists.json");
  if (!existsSync(legacy)) return;
  const existing = db.prepare("SELECT COUNT(*) AS n FROM lists").get() as { n: number };
  if (existing.n > 0) return;

  const lists = parseLists(JSON.parse(readFileSync(legacy, "utf8")));
  if (!lists) {
    console.error("data/lists.json no es válido; no se importa");
    return;
  }
  writeLists(lists);
  renameSync(legacy, join(DATA_DIR, "lists.json.migrado"));
  console.log(`Importadas ${lists.length} listas de lists.json a SQLite`);
}

importLegacyJson();
