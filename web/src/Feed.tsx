import { useEffect, useState } from "react";
import type { FeedVideo } from "./types";

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

function timeAgo(iso: string): string {
  const hours = (new Date(iso).getTime() - Date.now()) / 3_600_000;
  if (Math.abs(hours) < 24) return rtf.format(Math.round(hours), "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

export function Feed({ listId }: { listId: string }) {
  const [videos, setVideos] = useState<FeedVideo[] | null>(null);

  useEffect(() => {
    setVideos(null);
    fetch(`/api/lists/${listId}/feed`)
      .then((r) => r.json())
      .then(setVideos);
  }, [listId]);

  if (!videos) return <p>Cargando vídeos…</p>;
  if (videos.length === 0) return <p>Esta lista no tiene canales o no hay vídeos recientes.</p>;

  return (
    <div className="grid">
      {videos.map((v) => (
        <a key={v.videoId} className="card" href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noreferrer">
          <img src={v.thumbnail} alt="" />
          <strong>{v.title}</strong>
          <span>
            {v.channelTitle} · {timeAgo(v.published)}
          </span>
        </a>
      ))}
    </div>
  );
}
