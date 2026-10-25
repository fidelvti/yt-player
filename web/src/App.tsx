import { useEffect, useState } from "react";
import { Feed } from "./Feed";
import { Manage } from "./Manage";
import type { ChannelList, Subscription } from "./types";

const MANAGE = "manage";

export function App() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [lists, setLists] = useState<ChannelList[]>([]);
  const [view, setView] = useState<string>(MANAGE);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d: { loggedIn: boolean }) => setLoggedIn(d.loggedIn));
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    fetch("/api/subscriptions").then((r) => r.json()).then(setSubs);
    fetch("/api/lists")
      .then((r) => r.json())
      .then((l: ChannelList[]) => {
        setLists(l);
        if (l.length > 0) setView(l[0].id);
      });
  }, [loggedIn]);

  async function saveLists(next: ChannelList[]) {
    setLists(next);
    await fetch("/api/lists", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  }

  if (loggedIn === null) return <p>Cargando…</p>;

  if (!loggedIn) {
    return (
      <main className="login">
        <h1>yt-player</h1>
        <a href="/auth/login">Iniciar sesión con Google</a>
      </main>
    );
  }

  return (
    <div className="layout">
      <nav>
        <h1>yt-player</h1>
        {lists.map((l) => (
          <button key={l.id} className={view === l.id ? "active" : ""} onClick={() => setView(l.id)}>
            {l.name} <small>{l.channelIds.length}</small>
          </button>
        ))}
        <button className={view === MANAGE ? "active" : ""} onClick={() => setView(MANAGE)}>
          ⚙ Gestionar listas
        </button>
      </nav>
      <main>
        {view === MANAGE ? (
          <Manage subs={subs} lists={lists} onChange={saveLists} />
        ) : (
          <Feed listId={view} />
        )}
      </main>
    </div>
  );
}
