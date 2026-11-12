import { AddChannels } from "./AddChannels";
import { ChannelRow } from "./ChannelRow";
import { compareNames } from "./listOps";
import type { AddResult, CatalogChannel } from "./types";

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

export function Catalog({ catalog, onRefresh, refreshing, onRemove, onAdd }: Props) {
  const sorted = [...catalog].sort((a, b) => compareNames(a.title, b.title));

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

      <AddChannels
        onAdd={onAdd}
        buttonLabel="Añadir al catálogo"
        ariaLabel="URLs o handles de canales para añadir al catálogo"
      />

      {sorted.length === 0 ? (
        <p className="status">El catálogo está vacío. Aquí aparecerán los canales de los que te des de baja.</p>
      ) : (
        <ul className="subs catalog">
          {sorted.map((c) => (
            <ChannelRow
              key={c.channelId}
              channelId={c.channelId}
              title={c.title}
              meta={meta(c)}
              thumbnail={c.thumbnail}
              removeLabel="Quitar del catálogo"
              onRemove={() => onRemove(c.channelId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
