import type { SummaryResult } from "./types";

const dateFmt = new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function History({ summaries, onOpen }: { summaries: SummaryResult[]; onOpen: (id: number) => void }) {
  return (
    <div>
      <header className="page-header">
        <h2>Resúmenes</h2>
        <p>Se guardan 30 días. Ábrelos cuando quieras, sin volver a pagar.</p>
      </header>

      {summaries.length === 0 ? (
        <p className="status">Aún no has generado ningún resumen.</p>
      ) : (
        <ul className="history">
          {summaries.map((s) => {
            const [first, ...rest] = s.included;
            return (
              <li key={s.id}>
                <button onClick={() => onOpen(s.id)}>
                  <span className="when">
                    {dateFmt.format(s.createdAt)} · {s.included.length} {s.included.length === 1 ? "vídeo" : "vídeos"}
                  </span>
                  <span className="titles">
                    {first?.title}
                    {rest.length > 0 && ` y ${rest.length} más`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
