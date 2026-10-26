import type { ChannelList } from "./types";

/** Renombra una lista. Devuelve las listas sin cambios si el nombre queda vacío. */
export function renameList(lists: ChannelList[], id: string, name: string): ChannelList[] {
  const trimmed = name.trim();
  if (!trimmed) return lists;
  return lists.map((l) => (l.id === id ? { ...l, name: trimmed } : l));
}

/** Borra una lista. Sus canales no se pierden: vuelven a quedar "sin lista". */
export function deleteList(lists: ChannelList[], id: string): ChannelList[] {
  return lists.filter((l) => l.id !== id);
}
