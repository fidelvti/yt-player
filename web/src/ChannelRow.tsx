import { useState } from "react";

interface Props {
  channelId: string;
  title: string;
  /** Segunda línea: handle, origen, estado… */
  meta: string;
  thumbnail?: string | null;
  /** Texto del botón de quitar (tooltip y accesibilidad), p. ej. "Quitar del catálogo". */
  removeLabel: string;
  onRemove: () => void;
}

/** Fila de canal: foto, nombre, enlace a YouTube y botón de quitar con confirmación en dos pasos. */
export function ChannelRow({ channelId, title, meta, thumbnail, removeLabel, onRemove }: Props) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li>
      {thumbnail && <img src={thumbnail} width={32} height={32} alt="" loading="lazy" />}
      <span className="catalog-name">
        <strong>{title}</strong>
        <small>{meta}</small>
      </span>
      <a className="btn" href={`https://www.youtube.com/channel/${channelId}`} target="_blank" rel="noreferrer">
        Abrir en YouTube ↗
      </a>
      {confirming ? (
        <div className="confirm-inline">
          <button
            className="btn danger"
            onClick={() => {
              setConfirming(false);
              onRemove();
            }}
          >
            Quitar
          </button>
          <button className="btn" onClick={() => setConfirming(false)}>
            No
          </button>
        </div>
      ) : (
        <button className="icon-btn" title={removeLabel} aria-label={`${removeLabel}: ${title}`} onClick={() => setConfirming(true)}>
          ×
        </button>
      )}
    </li>
  );
}
