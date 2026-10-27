import type { ChannelList } from "./types";

// Orden alfabético en español: sin distinguir mayúsculas ni tildes, y con los números por su valor.
const byName = new Intl.Collator("es", { sensitivity: "base", numeric: true });

/** Copia de las listas ordenada alfabéticamente por nombre (no altera el orden guardado). */
export function sortByName(lists: ChannelList[]): ChannelList[] {
  return [...lists].sort((a, b) => byName.compare(a.name, b.name));
}

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
