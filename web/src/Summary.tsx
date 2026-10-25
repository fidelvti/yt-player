import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { SummaryResult, VideoRef } from "./types";

interface Usage {
  summaries: number;
  costUsd: number;
}

const usd = (n: number) => `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;

/** Markdown mínimo: "## títulos", "- viñetas" y **negrita**. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

function renderMarkdown(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (bullets.length === 0) return;
    out.push(
      <ul key={out.length}>
        {bullets.map((b, i) => (
          <li key={i}>{inline(b)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (/^[-*] /.test(trimmed)) {
      bullets.push(trimmed.slice(2));
      continue;
    }
    flush();
    if (/^#{1,6} /.test(trimmed)) out.push(<h3 key={out.length}>{inline(trimmed.replace(/^#+ /, ""))}</h3>);
    else if (trimmed) out.push(<p key={out.length}>{inline(trimmed)}</p>);
  }
  flush();
  return out;
}

interface SummaryProps {
  /** Vídeos a resumir (resumen nuevo). */
  videos?: VideoRef[];
  /** Resumen ya guardado: se muestra tal cual, sin llamar a la API. */
  stored?: SummaryResult;
  onSummarized: (result: SummaryResult) => void;
  /** Solo en resúmenes guardados: volver a generarlo con los mismos vídeos (se cobra de nuevo). */
  onRegenerate?: (videos: VideoRef[]) => void;
  onClose: () => void;
}

const dateFmt = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function Summary({ videos = [], stored, onSummarized, onRegenerate, onClose }: SummaryProps) {
  const [result, setResult] = useState<SummaryResult | null>(stored ?? null);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  // En desarrollo React ejecuta los efectos dos veces; sin este guard se lanzarían (y cobrarían) dos resúmenes.
  const started = useRef(stored !== undefined);
  const closed = useRef(false);

  useEffect(() => {
    closed.current = false;
    if (!started.current) {
      started.current = true;
      const payload = videos.map(({ videoId, title, channelTitle }) => ({ videoId, title, channelTitle }));

      fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videos: payload }),
      })
        .then(async (r) => {
          const body = await r.json();
          if (!r.ok) throw new Error(body.error ?? "Error al resumir");
          const result = body as SummaryResult;
          // El servidor ya lo ha guardado aunque el panel se haya cerrado: la lista se actualiza siempre.
          onSummarized(result);
          if (closed.current) return;
          setResult(result);
        })
        .catch((err: Error) => {
          if (!closed.current) setError(err.message);
        });
    }
    return () => {
      closed.current = true;
    };
    // La selección se congela al abrir el panel: solo se resume una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (result) fetch("/api/usage").then((u) => u.json()).then(setUsage);
  }, [result]);

  return (
    <div className="overlay" onClick={onClose}>
      <section className="panel" onClick={(e) => e.stopPropagation()}>
        <header className="panel-header">
          <div>
            <h2>Resumen de {result?.included.length ?? videos.length} vídeos</h2>
            {stored && <span className="meta">{dateFmt.format(stored.createdAt)}</span>}
          </div>
          <button className="btn" onClick={onClose}>Cerrar</button>
        </header>

        {!result && !error && (
          <p className="status">
            <span className="spinner" /> Descargando transcripciones y resumiendo… puede tardar unos segundos.
          </p>
        )}

        {error && <p className="player-error">{error}</p>}

        {result && (
          <>
            <div className="summary-body">{renderMarkdown(result.text)}</div>

            <details className="sources">
              <summary>Vídeos incluidos ({result.included.length})</summary>
              <ol>
                {result.included.map((v) => (
                  <li key={v.videoId}>
                    <a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noreferrer">
                      {v.title}
                    </a>{" "}
                    <span className="meta">· {v.channelTitle}</span>
                  </li>
                ))}
              </ol>
            </details>

            {result.skipped.length > 0 && (
              <div className="skipped">
                <strong>No incluidos ({result.skipped.length}):</strong>
                <ul>
                  {result.skipped.map((s) => (
                    <li key={s.video.videoId}>
                      {s.video.title || s.video.videoId} <span className="meta">— {s.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {stored && onRegenerate && (
              <div className="regenerate">
                <button className="btn" onClick={() => onRegenerate(result.included)}>
                  Volver a generar
                </button>
                <span className="meta">Hace una llamada nueva a la API (≈ {usd(result.usage.costUsd)}).</span>
              </div>
            )}

            <footer className="panel-footer">
              Este resumen: {usd(result.usage.costUsd)} ({result.usage.inputTokens.toLocaleString("es")} tokens de entrada,{" "}
              {result.usage.outputTokens.toLocaleString("es")} de salida)
              {usage && (
                <>
                  {" "}
                  · Este mes: {usd(usage.costUsd)} en {usage.summaries} resúmenes
                </>
              )}
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
