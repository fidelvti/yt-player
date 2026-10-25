import { useEffect, useRef, useState } from "react";
import type { FeedVideo } from "./types";

interface YTPlayer {
  loadVideoById(videoId: string): void;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events: {
        onReady: () => void;
        onStateChange: (e: { data: number }) => void;
        onError: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const SPEEDS = [1, 1.25, 1.5, 1.75, 2];
const SPEED_KEY = "yt-player.speed";
const PLAYING = 1;

const ERRORS: Record<number, string> = {
  2: "parámetro no válido",
  5: "error del reproductor HTML5",
  100: "el vídeo no existe o es privado",
  101: "el propietario no permite verlo incrustado",
  150: "el propietario no permite verlo incrustado",
  153: "falta el origen (referrer) de la petición",
};

let apiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return apiPromise;
}

function savedSpeed(): number {
  try {
    const n = Number(localStorage.getItem(SPEED_KEY));
    return SPEEDS.includes(n) ? n : 1;
  } catch {
    return 1;
  }
}

interface PlayerProps {
  video: FeedVideo;
  onStarted: (videoId: string) => void;
  onClose: () => void;
}

export function Player({ video, onStarted, onClose }: PlayerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [speed, setSpeed] = useState(savedSpeed);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const firstVideoId = useRef(video.videoId);
  const videoIdRef = useRef(video.videoId);
  videoIdRef.current = video.videoId;
  const onStartedRef = useRef(onStarted);
  onStartedRef.current = onStarted;
  const [error, setError] = useState<number | null>(null);

  // Crea el reproductor una sola vez; los cambios de vídeo van por loadVideoById.
  useEffect(() => {
    let cancelled = false;
    let player: YTPlayer | null = null;

    loadYouTubeApi().then((YT) => {
      if (cancelled || !mountRef.current) return;
      const target = document.createElement("div");
      mountRef.current.appendChild(target);
      player = new YT.Player(target, {
        videoId: firstVideoId.current,
        playerVars: { autoplay: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady: () => player?.setPlaybackRate(speedRef.current),
          onError: (e) => setError(e.data),
          // YouTube puede reiniciar la velocidad al cargar otro vídeo.
          onStateChange: (e) => {
            if (e.data !== PLAYING) return;
            onStartedRef.current(videoIdRef.current);
            if (player?.getPlaybackRate() !== speedRef.current) {
              player?.setPlaybackRate(speedRef.current);
            }
          },
        },
      });
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      player?.destroy();
      playerRef.current = null;
      if (mountRef.current) mountRef.current.replaceChildren();
    };
  }, []);

  useEffect(() => {
    setError(null);
    playerRef.current?.loadVideoById(video.videoId);
  }, [video.videoId]);

  function changeSpeed(rate: number) {
    setSpeed(rate);
    playerRef.current?.setPlaybackRate(rate);
    try {
      localStorage.setItem(SPEED_KEY, String(rate));
    } catch {
      // sin localStorage la velocidad simplemente no se recuerda
    }
  }

  return (
    <section className="player">
      <div className="player-frame" ref={mountRef} />
      {error !== null && (
        <p className="player-error">
          Error del reproductor de YouTube (código {error}):{" "}
          {ERRORS[error] ?? "desconocido"}. Puedes abrirlo en YouTube con el enlace de abajo.
        </p>
      )}
      <div className="player-bar">
        <div className="player-title">
          <strong>{video.title}</strong>
          <span>{video.channelTitle}</span>
        </div>
        <div className="speeds">
          {SPEEDS.map((s) => (
            <button key={s} className={s === speed ? "active" : ""} onClick={() => changeSpeed(s)}>
              {s}x
            </button>
          ))}
        </div>
        <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noreferrer">
          Abrir en YouTube
        </a>
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
    </section>
  );
}
