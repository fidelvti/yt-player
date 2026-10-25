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
  onPlay: (v: FeedVideo) => void;
}

export function Feed({ listId, playingId, watched, onPlay }: FeedProps) {
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
      {videos.map((v) => (
        <button
          key={v.videoId}
          className={`card ${v.videoId === playingId ? "is-playing" : ""} ${watched.has(v.videoId) ? "is-watched" : ""}`}
          onClick={() => onPlay(v)}
        >
          <div className="thumb">
            <img src={v.thumbnail} alt="" loading="lazy" />
            {v.videoId === playingId ? (
              <span className="badge playing-badge">Reproduciendo</span>
            ) : (
              watched.has(v.videoId) && <span className="badge watched-badge">✓ Visto</span>
            )}
          </div>
          <strong>{v.title}</strong>
          <span className="meta">
            {v.channelTitle} · {timeAgo(v.published)}
          </span>
        </button>
      ))}
    </div>
  );
}
