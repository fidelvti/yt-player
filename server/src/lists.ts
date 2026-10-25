import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface ChannelList {
  id: string;
  name: string;
  channelIds: string[];
}

const LISTS_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../data/lists.json");

export async function loadLists(): Promise<ChannelList[]> {
  try {
    return JSON.parse(await readFile(LISTS_PATH, "utf8")) as ChannelList[];
  } catch {
    return [];
  }
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

export async function saveLists(lists: ChannelList[]): Promise<void> {
  await mkdir(dirname(LISTS_PATH), { recursive: true });
  await writeFile(LISTS_PATH, JSON.stringify(lists, null, 2));
}
