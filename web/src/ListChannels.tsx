import { AddChannels } from "./AddChannels";
import { ChannelRow } from "./ChannelRow";
import { compareNames } from "./listOps";
import type { AddResult, CatalogChannel, ChannelList, Subscription } from "./types";

interface Props {
  list: ChannelList;
  subs: Subscription[];
  /** Canales del catálogo que se unirán a esta lista cuando te suscribas. */
  pending: CatalogChannel[];
  /** Añade los canales pegados a esta lista; lanza un Error con el motivo si no se pudo. */
  onAdd: (text: string) => Promise<AddResult[]>;
  onRemoveFromList: (channelId: string) => void;
  onRemoveFromCatalog: (channelId: string) => void;
}

/** Los canales de una lista, con el mismo formato que el catálogo. */
export function ListChannels({ list, subs, pending, onAdd, onRemoveFromList, onRemoveFromCatalog }: Props) {
  const byId = new Map(subs.map((s) => [s.channelId, s]));
  const members = list.channelIds
    .map((id) => ({ id, title: byId.get(id)?.title ?? id, thumbnail: byId.get(id)?.thumbnail ?? null }))
    .sort((a, b) => compareNames(a.title, b.title));
  const waiting = [...pending].sort((a, b) => compareNames(a.title, b.title));

  return (
    <div>
      <header className="page-header">
        <div>
          <h2>Canales</h2>
          <p>
            Los canales de «{list.name}». Para añadir uno, pega su URL o @handle: si ya estás suscrito entra en la
            lista; si no, queda pendiente en el Catálogo y se unirá a ella cuando te suscribas.
          </p>
        </div>
      </header>

      <AddChannels
        onAdd={onAdd}
        buttonLabel="Añadir a la lista"
        ariaLabel={`URLs o handles de canales para añadir a la lista ${list.name}`}
      />

      {members.length === 0 && waiting.length === 0 && <p className="status">Esta lista aún no tiene canales.</p>}

      {members.length > 0 && (
        <ul className="subs catalog">
          {members.map((m) => (
            <ChannelRow
              key={m.id}
              channelId={m.id}
              title={m.title}
              meta="Suscrito"
              thumbnail={m.thumbnail}
              removeLabel="Quitar de la lista"
              onRemove={() => onRemoveFromList(m.id)}
            />
          ))}
        </ul>
      )}

      {waiting.length > 0 && (
        <>
          <h3 className="section-title">Pendientes de suscripción · {waiting.length}</h3>
          <ul className="subs catalog">
            {waiting.map((c) => (
              <ChannelRow
                key={c.channelId}
                channelId={c.channelId}
                title={c.title}
                meta={[c.handle, "se unirá a esta lista cuando te suscribas"].filter(Boolean).join(" · ")}
                thumbnail={c.thumbnail}
                removeLabel="Quitar del catálogo"
                onRemove={() => onRemoveFromCatalog(c.channelId)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
