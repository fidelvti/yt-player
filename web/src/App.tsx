import { useEffect, useState } from "react";
import { Feed } from "./Feed";
import { Manage } from "./Manage";
import { Player } from "./Player";
import type { ChannelList, FeedVideo, Subscription } from "./types";

const MANAGE = "manage";

export function App() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [lists, setLists] = useState<ChannelList[]>([]);
  const [view, setView] = useState<string>(MANAGE);
  const [playing, setPlaying] = useState<FeedVideo | null>(null);
  const [watched, setWatched] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d: { loggedIn: boolean }) => setLoggedIn(d.loggedIn));
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    fetch("/api/subscriptions").then((r) => r.json()).then(setSubs);
    fetch("/api/watched")
      .then((r) => r.json())
      .then((ids: string[]) => setWatched(new Set(ids)));
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

  const currentList = lists.find((l) => l.id === view);

  function markWatched(videoId: string) {
    setWatched((prev) => (prev.has(videoId) ? prev : new Set(prev).add(videoId)));
    void fetch(`/api/watched/${videoId}`, { method: "POST" });
  }

  if (loggedIn === null) return <p className="status">Cargando…</p>;

  if (!loggedIn) {
    return (
      <main className="login">
        <div className="logo">▶</div>
        <h1>yt-player</h1>
        <p>Tus suscripciones de YouTube, en listas a tu medida.</p>
        <a className="btn primary" href="/auth/login">Iniciar sesión con Google</a>
      </main>
    );
  }

  return (
    <div className="layout">
      <nav>
        <div className="brand">
          <div className="logo">▶</div>
          <h1>yt-player</h1>
        </div>
        <div className="nav-label">Listas</div>
        {lists.length === 0 && <p className="nav-hint">Aún no tienes listas.</p>}
        {lists.map((l) => (
          <button key={l.id} className={`item ${view === l.id ? "active" : ""}`} onClick={() => setView(l.id)}>
            {l.name} <span className="count">{l.channelIds.length}</span>
          </button>
        ))}
        <div className="spacer" />
        <button className={`item ${view === MANAGE ? "active" : ""}`} onClick={() => setView(MANAGE)}>
          Gestionar listas
        </button>
      </nav>
      <main>
        {view === MANAGE || !currentList ? (
          <Manage subs={subs} lists={lists} onChange={saveLists} />
        ) : (
          <>
            {playing && <Player video={playing} onStarted={markWatched} onClose={() => setPlaying(null)} />}
            <header className="page-header">
              <h2>{currentList.name}</h2>
              <p>Vídeos recientes de {currentList.channelIds.length} canales</p>
            </header>
            <Feed listId={currentList.id} playingId={playing?.videoId} watched={watched} onPlay={setPlaying} />
          </>
        )}
      </main>
    </div>
  );
}
