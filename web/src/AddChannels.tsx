import { useState } from "react";
import type { AddResult, AddStatus } from "./types";

interface Props {
  /** Añade los canales pegados; lanza un Error con el motivo si no se pudo. */
  onAdd: (text: string) => Promise<AddResult[]>;
  buttonLabel: string;
  ariaLabel: string;
}

const LABELS: Record<AddStatus, string> = {
  added: "Añadidos",
  in_catalog: "Ya estaban en el catálogo",
  subscribed: "Ya estás suscrito",
  added_to_list: "Añadidos a la lista",
  in_list: "Ya estaban en esta lista",
  in_other_list: "Ya están en otra lista",
  pending: "Pendientes de suscripción (se unirán a la lista cuando te suscribas)",
  not_found: "No existe ese canal",
  unsupported: "No parece la URL o el @handle de un canal",
  error: "No se pudo consultar",
};
const ORDER: AddStatus[] = [
  "added",
  "added_to_list",
  "pending",
  "in_catalog",
  "subscribed",
  "in_list",
  "in_other_list",
  "not_found",
  "unsupported",
  "error",
];
const GOOD: AddStatus[] = ["added", "added_to_list", "pending"];
const NEUTRAL: AddStatus[] = ["in_catalog", "subscribed", "in_list"];
const FAILED: AddStatus[] = ["not_found", "unsupported", "error"];

function describe(r: AddResult): string {
  if (!r.channel) return r.input;
  return r.listName ? `«${r.channel.title}» (en «${r.listName}»)` : `«${r.channel.title}»`;
}

/** Resumen del resultado, agrupado por estado: "Añadidos: «A», «B»". */
function summarize(results: AddResult[]): { status: AddStatus | "failed"; text: string }[] {
  return ORDER.flatMap((status) => {
    const items = results.filter((r) => r.status === status);
    return items.length === 0 ? [] : [{ status, text: `${LABELS[status]}: ${items.map(describe).join(", ")}` }];
  });
}

/** Cuadro para pegar URLs o @handles de canales, con el resultado agrupado debajo. */
export function AddChannels({ onAdd, buttonLabel, ariaLabel }: Props) {
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [outcome, setOutcome] = useState<{ status: AddStatus | "failed"; text: string }[] | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setAdding(true);
    try {
      const results = await onAdd(text);
      setOutcome(summarize(results));
      // Se vacía solo lo que se ha procesado bien; lo que falló se queda para corregirlo.
      setText(results.filter((r) => FAILED.includes(r.status)).map((r) => r.input).join("\n"));
    } catch (err) {
      setOutcome([{ status: "failed", text: (err as Error).message }]);
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <form className="add-form" onSubmit={add}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Añadir canales: pega una URL o un @handle (varios, uno por línea)"
          aria-label={ariaLabel}
        />
        <button className="btn primary" disabled={adding || !text.trim()}>
          {adding ? "Añadiendo…" : buttonLabel}
        </button>
      </form>

      {outcome && (
        <div className="add-results" role="status">
          {outcome.map((o) => (
            <p
              key={o.text}
              className={o.status !== "failed" && GOOD.includes(o.status) ? "ok" : o.status !== "failed" && NEUTRAL.includes(o.status) ? "" : "warn"}
            >
              {o.text}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
