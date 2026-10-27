import { useEffect, useState } from "react";
import { Feed } from "./Feed";
import { History } from "./History";
import { Manage } from "./Manage";
import { Player } from "./Player";
import { SidebarList } from "./SidebarList";
import { deleteList, renameList, sortByName } from "./listOps";
import { Summary } from "./Summary";
import type { ChannelList, FeedVideo, Subscription, SubscriptionsResponse, SummaryResult, VideoRef } from "./types";

const MANAGE = "manage";
const HISTORY = "history";

type Panel = { kind: "new"; videos: VideoRef[] } | { kind: "stored"; summary: SummaryResult };

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
  const [sessionExpired, setSessionExpired] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [subsNotice, setSubsNotice] = useState<string | null>(null);
  const [refreshingSubs, setRefreshingSubs] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d: { loggedIn: boolean }) => setLoggedIn(d.loggedIn));
  }, []);

  /** Lee las suscripciones (el servidor quita de las listas las bajas) y después recarga las listas. */
  async function loadSubscriptions(): Promise<ChannelList[] | null> {
    setRefreshingSubs(true);
    try {
      const r = await fetch("/api/subscriptions");
      if (r.status === 401) {
        // El acceso a Google ha caducado (el servidor ya ha descartado el token).
        setSessionExpired(true);
        setLoggedIn(false);
        return null;
      }
      const body = (await r.json()) as Partial<SubscriptionsResponse>;
      if (r.ok && Array.isArray(body.subscriptions)) {
        setSubs(body.subscriptions);
        if (body.pruneSkipped) {
          const { wouldRemove, total } = body.pruneSkipped;
          setSubsNotice(
            `No se han quitado ${wouldRemove} de ${total} canales de tus listas aunque no aparecen en tus suscripciones: son demasiados de golpe y puede ser un fallo de YouTube. Prueba más tarde con "Actualizar suscripciones".`,
          );
        } else if (body.pruned) {
          setSubsNotice(
            `Se ${body.pruned === 1 ? "ha quitado 1 canal" : `han quitado ${body.pruned} canales`} de tus listas porque ya no estás suscrito.`,
          );
        }
      }
    } catch {
      // sin conexión: se siguen usando las listas guardadas
    } finally {
      setRefreshingSubs(false);
    }
    const saved = (await fetch("/api/lists").then((r) => r.json())) as ChannelList[];
    setLists(saved);
    return saved;
  }

  useEffect(() => {
    if (!loggedIn) return;
    fetch("/api/watched")
      .then((r) => r.json())
      .then((ids: string[]) => setWatched(new Set(ids)));
    fetch("/api/summaries")
      .then((r) => r.json())
      .then(setSummaries);
    void loadSubscriptions().then((saved) => {
      if (saved && saved.length > 0) setView(sortByName(saved)[0].id); // la primera de la barra lateral
    });
    // loadSubscriptions solo usa setters estables
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const channelTitles = new Map(subs.map((s) => [s.channelId, s.title]));

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

  function removeList(id: string) {
    const remaining = deleteList(lists, id);
    void saveLists(remaining);
    if (view === id) changeView(sortByName(remaining)[0]?.id ?? MANAGE); // la vista abierta ya no existe
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

  function unmarkWatched(videoId: string) {
    setWatched((prev) => {
      const next = new Set(prev);
      next.delete(videoId);
      return next;
    });
    void fetch(`/api/watched/${videoId}`, { method: "DELETE" });
  }

  async function logout() {
    await fetch("/auth/logout", { method: "POST" });
    setSessionExpired(false);
    setSubs([]);
    setLists([]);
    setSubsNotice(null);
    setSelected(new Map());
    setPlaying(null);
    setPanel(null);
    setLoggedIn(false);
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
        {sessionExpired ? (
          <p className="notice">Tu sesión de Google ha caducado. Vuelve a iniciar sesión para seguir.</p>
        ) : (
          <p>Tus suscripciones de YouTube, en listas a tu medida.</p>
        )}
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
        {sortByName(lists).map((l) => (
          <SidebarList
            key={l.id}
            list={l}
            active={view === l.id}
            onSelect={() => changeView(l.id)}
            onRename={(name) => void saveLists(renameList(lists, l.id, name))}
            onDelete={() => removeList(l.id)}
          />
        ))}
        <div className="spacer" />
        <button className={`item ${view === HISTORY ? "active" : ""}`} onClick={() => changeView(HISTORY)}>
          Resúmenes <span className="count">{summaries.length}</span>
        </button>
        <button className={`item ${view === MANAGE ? "active" : ""}`} onClick={() => changeView(MANAGE)}>
          Gestionar listas
        </button>
        <button className="item logout" onClick={logout}>
          Cerrar sesión
        </button>
      </nav>
      <main>
        {subsNotice && (
          <p className="banner">
            <span>{subsNotice}</span>
            <button aria-label="Cerrar aviso" onClick={() => setSubsNotice(null)}>×</button>
          </p>
        )}
        {view === HISTORY ? (
          <History summaries={summaries} onOpen={openSummary} />
        ) : view === MANAGE || !currentList ? (
          <Manage subs={subs} lists={lists} onChange={saveLists} onRefresh={loadSubscriptions} refreshing={refreshingSubs} />
        ) : (
          <>
            {playing && <Player video={playing} onStarted={markWatched} onClose={() => setPlaying(null)} />}
            <header className="page-header with-action">
              <div>
                <h2>{currentList.name}</h2>
                <p>Vídeos recientes de {currentList.channelIds.length} canales</p>
              </div>
              <button className="btn" onClick={() => setRefreshKey((k) => k + 1)}>
                ↻ Actualizar
              </button>
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
              onUnwatch={unmarkWatched}
              refreshKey={refreshKey}
              channelTitles={channelTitles}
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
          onRegenerate={(videos) => setPanel({ kind: "new", videos })}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}
