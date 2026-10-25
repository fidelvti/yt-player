import { useEffect, useState } from "react";
import { Feed } from "./Feed";
import { History } from "./History";
import { Manage } from "./Manage";
import { Player } from "./Player";
import { Summary } from "./Summary";
import type { ChannelList, FeedVideo, Subscription, SummaryResult } from "./types";

const MANAGE = "manage";
const HISTORY = "history";

type Panel = { kind: "new"; videos: FeedVideo[] } | { kind: "stored"; summary: SummaryResult };

export function App() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [lists, setLists] = useState<ChannelList[]>([]);
  const [view, setView] = useState<string>(MANAGE);
  const [playing, setPlaying] = useState<FeedVideo | null>(null);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [summaries, setSummaries] = useState<SummaryResult[]>([]);
  const [selected, setSelected] = useState<Map<string, FeedVideo>>(new Map());
  const [panel, setPanel] = useState<Panel | null>(null);

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
    fetch("/api/summaries")
      .then((r) => r.json())
      .then(setSummaries);
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

  // Vídeo -> su resumen más reciente (summaries llega ordenado de más nuevo a más antiguo).
  const summarized = new Map<string, number>();
  for (const s of summaries) for (const v of s.included) if (!summarized.has(v.videoId)) summarized.set(v.videoId, s.id);

  function openSummary(id: number) {
    const summary = summaries.find((s) => s.id === id);
    if (summary) setPanel({ kind: "stored", summary });
  }

  function addSummary(result: SummaryResult) {
    setSummaries((prev) => (prev.some((s) => s.id === result.id) ? prev : [result, ...prev]));
  }

  function changeView(next: string) {
    setView(next);
    setSelected(new Map()); // la selección es de una lista concreta
  }

  function toggleSelect(video: FeedVideo) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (!next.delete(video.videoId)) next.set(video.videoId, video);
      return next;
    });
  }

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
          <button key={l.id} className={`item ${view === l.id ? "active" : ""}`} onClick={() => changeView(l.id)}>
            {l.name} <span className="count">{l.channelIds.length}</span>
          </button>
        ))}
        <div className="spacer" />
        <button className={`item ${view === HISTORY ? "active" : ""}`} onClick={() => changeView(HISTORY)}>
          Resúmenes <span className="count">{summaries.length}</span>
        </button>
        <button className={`item ${view === MANAGE ? "active" : ""}`} onClick={() => changeView(MANAGE)}>
          Gestionar listas
        </button>
      </nav>
      <main>
        {view === HISTORY ? (
          <History summaries={summaries} onOpen={openSummary} />
        ) : view === MANAGE || !currentList ? (
          <Manage subs={subs} lists={lists} onChange={saveLists} />
        ) : (
          <>
            {playing && <Player video={playing} onStarted={markWatched} onClose={() => setPlaying(null)} />}
            <header className="page-header">
              <h2>{currentList.name}</h2>
              <p>Vídeos recientes de {currentList.channelIds.length} canales</p>
            </header>
            <Feed
              listId={currentList.id}
              playingId={playing?.videoId}
              watched={watched}
              summarized={summarized}
              selected={selected}
              onPlay={setPlaying}
              onToggleSelect={toggleSelect}
              onOpenSummary={openSummary}
            />
          </>
        )}
      </main>

      {selected.size > 0 && !panel && view !== HISTORY && (
        <div className="selection-bar">
          <span>{selected.size} {selected.size === 1 ? "vídeo seleccionado" : "vídeos seleccionados"}</span>
          <button className="btn" onClick={() => setSelected(new Map())}>Limpiar</button>
          <button className="btn primary" onClick={() => setPanel({ kind: "new", videos: [...selected.values()] })}>Resumir</button>
        </div>
      )}

      {panel && (
        <Summary
          key={panel.kind === "stored" ? panel.summary.id : "new"}
          videos={panel.kind === "new" ? panel.videos : undefined}
          stored={panel.kind === "stored" ? panel.summary : undefined}
          onSummarized={addSummary}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}
