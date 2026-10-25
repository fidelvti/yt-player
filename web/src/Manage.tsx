import { useState } from "react";
import type { ChannelList, Subscription } from "./types";

interface Props {
  subs: Subscription[];
  lists: ChannelList[];
  onChange: (lists: ChannelList[]) => void;
}

export function Manage({ subs, lists, onChange }: Props) {
  const [newName, setNewName] = useState("");

  const listOf = (channelId: string) => lists.find((l) => l.channelIds.includes(channelId))?.id ?? "";

  function assign(channelId: string, listId: string) {
    onChange(
      lists.map((l) => {
        const without = l.channelIds.filter((c) => c !== channelId);
        return { ...l, channelIds: l.id === listId ? [...without, channelId] : without };
      }),
    );
  }

  function addList(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    onChange([...lists, { id: crypto.randomUUID(), name, channelIds: [] }]);
    setNewName("");
  }

  const unassigned = subs.filter((s) => !listOf(s.channelId)).length;

  return (
    <div>
      <header className="page-header">
        <h2>Gestionar listas</h2>
        <p>{unassigned} de {subs.length} canales sin lista.</p>
      </header>
      <form onSubmit={addList} className="create-form">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nueva lista (p. ej. Finanzas)" />
        <button className="btn primary">Crear lista</button>
      </form>
      <ul className="subs">
        {subs.map((s) => (
          <li key={s.channelId}>
            <img src={s.thumbnail} width={32} height={32} alt="" />
            <span>{s.title}</span>
            <select className={listOf(s.channelId) ? "assigned" : ""} value={listOf(s.channelId)} onChange={(e) => assign(s.channelId, e.target.value)}>
              <option value="">Sin lista</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
