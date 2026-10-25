import { useEffect, useState } from "react";
import type { FeedVideo } from "./types";

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

function timeAgo(iso: string): string {
  const hours = (new Date(iso).getTime() - Date.now()) / 3_600_000;
  if (Math.abs(hours) < 24) return rtf.format(Math.round(hours), "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

interface FeedProps {
  listId: string;
  playingId?: string;
  watched: Set<string>;
  summarized: Map<string, number>;
  selected: Map<string, FeedVideo>;
  onPlay: (v: FeedVideo) => void;
  onToggleSelect: (v: FeedVideo) => void;
  onOpenSummary: (summaryId: number) => void;
}

export function Feed({ listId, playingId, watched, summarized, selected, onPlay, onToggleSelect, onOpenSummary }: FeedProps) {
  const [videos, setVideos] = useState<FeedVideo[] | null>(null);

  useEffect(() => {
    setVideos(null);
    fetch(`/api/lists/${listId}/feed`)
      .then((r) => r.json())
      .then(setVideos);
  }, [listId]);

  if (!videos) return <p className="status">Cargando vídeos…</p>;
  if (videos.length === 0) return <p className="status">Esta lista no tiene canales o no hay vídeos recientes.</p>;

  return (
    <div className="grid">
      {videos.map((v) => {
        const isSelected = selected.has(v.videoId);
        return (
          <div key={v.videoId} className={`card-wrap ${isSelected ? "is-selected" : ""}`}>
            <button
              className={`card ${v.videoId === playingId ? "is-playing" : ""} ${watched.has(v.videoId) ? "is-watched" : ""}`}
              onClick={() => onPlay(v)}
            >
              <div className="thumb">
                <img src={v.thumbnail} alt="" loading="lazy" />
                <div className="badges">
                  {v.videoId === playingId ? (
                    <span className="badge playing-badge">Reproduciendo</span>
                  ) : (
                    watched.has(v.videoId) && <span className="badge watched-badge">✓ Visto</span>
                  )}
                </div>
              </div>
              <strong>{v.title}</strong>
              <span className="meta">
                {v.channelTitle} · {timeAgo(v.published)}
              </span>
            </button>
            {summarized.has(v.videoId) && (
              <button
                className={`summarized-btn ${watched.has(v.videoId) || v.videoId === playingId ? "below-badge" : ""}`}
                title="Ver el resumen guardado"
                onClick={() => onOpenSummary(summarized.get(v.videoId)!)}
              >
                ✦ Resumido
              </button>
            )}
            <button
              className="select-btn"
              aria-pressed={isSelected}
              aria-label={isSelected ? "Quitar de la selección" : "Seleccionar para resumir"}
              onClick={() => onToggleSelect(v)}
            >
              {isSelected ? "✓" : ""}
            </button>
          </div>
        );
      })}
    </div>
  );
}
