import { useState } from "react";
import { compareNames } from "./listOps";
import type { AddResult, AddStatus, CatalogChannel } from "./types";

interface Props {
  catalog: CatalogChannel[];
  onRefresh: () => void;
  refreshing: boolean;
  onRemove: (channelId: string) => void;
  /** Añade los canales pegados; lanza un Error con el motivo si no se pudo. */
  onAdd: (text: string) => Promise<AddResult[]>;
}

const dateFmt = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" });

function meta(c: CatalogChannel): string {
  const date = dateFmt.format(c.addedAt);
  const origin = c.source === "baja" ? `Dado de baja el ${date}` : `Añadido el ${date}`;
  return [c.handle, origin, c.listName ? `volverá a «${c.listName}» al suscribirte` : null].filter(Boolean).join(" · ");
}

const LABELS: Record<AddStatus, string> = {
  added: "Añadidos",
  in_catalog: "Ya estaban en el catálogo",
  subscribed: "Ya estás suscrito",
  not_found: "No existe ese canal",
  unsupported: "No parece la URL o el @handle de un canal",
  error: "No se pudo consultar",
};
const ORDER: AddStatus[] = ["added", "in_catalog", "subscribed", "not_found", "unsupported", "error"];

/** Resumen del resultado, agrupado por estado: "Añadidos: «A», «B»". */
function summarize(results: AddResult[]): { status: AddStatus; text: string }[] {
  return ORDER.flatMap((status) => {
    const items = results.filter((r) => r.status === status);
    if (items.length === 0) return [];
    const what = items.map((r) => (r.channel ? `«${r.channel.title}»` : r.input)).join(", ");
    return [{ status, text: `${LABELS[status]}: ${what}` }];
  });
}

export function Catalog({ catalog, onRefresh, refreshing, onRemove, onAdd }: Props) {
  // Quitar del catálogo es de dos pasos para evitar borrados sin querer.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [outcome, setOutcome] = useState<{ status: AddStatus | "failed"; text: string }[] | null>(null);
  const sorted = [...catalog].sort((a, b) => compareNames(a.title, b.title));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setAdding(true);
    try {
      const results = await onAdd(text);
      setOutcome(summarize(results));
      // Se vacía solo lo que se ha procesado bien; lo que falló se queda para corregirlo.
      const failed = results.filter((r) => r.status === "not_found" || r.status === "unsupported" || r.status === "error");
      setText(failed.map((r) => r.input).join("\n"));
    } catch (err) {
      setOutcome([{ status: "failed", text: (err as Error).message }]);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <header className="page-header with-action">
        <div>
          <h2>Catálogo</h2>
          <p>
            Canales que conoces pero a los que no estás suscrito. Para suscribirte, ábrelo en YouTube; al actualizar
            las suscripciones desaparecerá de aquí y, si venía de una lista, volverá a ella.
          </p>
        </div>
        <button className="btn" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? "Actualizando…" : "↻ Actualizar suscripciones"}
        </button>
      </header>

      <form className="add-form" onSubmit={add}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Añadir canales: pega una URL o un @handle (varios, uno por línea)"
          aria-label="URLs o handles de canales para añadir al catálogo"
        />
        <button className="btn primary" disabled={adding || !text.trim()}>
          {adding ? "Añadiendo…" : "Añadir al catálogo"}
        </button>
      </form>

      {outcome && (
        <div className="add-results" role="status">
          {outcome.map((o) => (
            <p key={o.text} className={o.status === "added" ? "ok" : o.status === "in_catalog" || o.status === "subscribed" ? "" : "warn"}>
              {o.text}
            </p>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="status">El catálogo está vacío. Aquí aparecerán los canales de los que te des de baja.</p>
      ) : (
        <ul className="subs catalog">
          {sorted.map((c) => (
            <li key={c.channelId}>
              <span className="avatar-initial" aria-hidden="true">
                {c.title.charAt(0).toUpperCase()}
              </span>
              <span className="catalog-name">
                <strong>{c.title}</strong>
                <small>{meta(c)}</small>
              </span>
              <a
                className="btn"
                href={`https://www.youtube.com/channel/${c.channelId}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir en YouTube ↗
              </a>
              {confirming === c.channelId ? (
                <span className="confirm-inline">
                  <button
                    className="btn danger"
                    onClick={() => {
                      setConfirming(null);
                      onRemove(c.channelId);
                    }}
                  >
                    Quitar
                  </button>
                  <button className="btn" onClick={() => setConfirming(null)}>
                    No
                  </button>
                </span>
              ) : (
                <button
                  className="icon-btn"
                  title="Quitar del catálogo"
                  aria-label={`Quitar ${c.title} del catálogo`}
                  onClick={() => setConfirming(c.channelId)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
