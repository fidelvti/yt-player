import { useState } from "react";
import { sortByName } from "./listOps";
import type { ChannelList, Subscription } from "./types";

interface Props {
  subs: Subscription[];
  lists: ChannelList[];
  onChange: (lists: ChannelList[]) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

type Filter = "unlisted" | "all";

export function Manage({ subs, lists, onChange, onRefresh, refreshing }: Props) {
  const [newName, setNewName] = useState("");
  const [filter, setFilter] = useState<Filter>("unlisted");

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
  const listed = subs.length - unassigned;
  const percent = subs.length > 0 ? Math.round((listed / subs.length) * 100) : 0;
  const visible = filter === "unlisted" ? subs.filter((s) => !listOf(s.channelId)) : subs;
  const sortedLists = sortByName(lists);

  return (
    <div>
      <header className="page-header with-action">
        <div>
          <h2>Gestionar listas</h2>
          <p>
            {listed} de {subs.length} canales en una lista
          </p>
        </div>
        <button className="btn" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? "Actualizando…" : "↻ Actualizar suscripciones"}
        </button>
      </header>

      <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>

      <form onSubmit={addList} className="create-form">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nueva lista (p. ej. Finanzas)" />
        <button className="btn primary">Crear lista</button>
      </form>

      <div className="segmented" role="group" aria-label="Qué canales mostrar">
        <button className={filter === "unlisted" ? "active" : ""} onClick={() => setFilter("unlisted")}>
          Sin lista <span className="count">{unassigned}</span>
        </button>
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
          Todos <span className="count">{subs.length}</span>
        </button>
      </div>

      {subs.length === 0 ? (
        <p className="status">No hay suscripciones cargadas.</p>
      ) : visible.length === 0 ? (
        <p className="status done">
          🎉 Todos tus canales están en una lista.{" "}
          <button className="link" onClick={() => setFilter("all")}>
            Ver todos
          </button>
        </p>
      ) : (
        <ul className="subs">
          {visible.map((s) => (
            <li key={s.channelId}>
              <img src={s.thumbnail} width={32} height={32} alt="" />
              <span>{s.title}</span>
              <select
                className={listOf(s.channelId) ? "assigned" : ""}
                value={listOf(s.channelId)}
                onChange={(e) => assign(s.channelId, e.target.value)}
              >
                <option value="">Sin lista</option>
                {sortedLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
