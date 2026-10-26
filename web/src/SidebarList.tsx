import { useEffect, useRef, useState } from "react";
import type { ChannelList } from "./types";

interface Props {
  list: ChannelList;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

type Mode = "view" | "edit" | "confirm";

const icon = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function PencilIcon() {
  return (
    <svg {...icon} aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...icon} aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function SidebarList({ list, active, onSelect, onRename, onDelete }: Props) {
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState(list.name);
  const inputRef = useRef<HTMLInputElement>(null);
  // Evita que el blur que puede disparar el desmontaje del campo guarde o cancele por segunda vez.
  const finished = useRef(false);

  useEffect(() => {
    if (mode === "edit") inputRef.current?.select();
  }, [mode]);

  function startEdit() {
    setDraft(list.name);
    finished.current = false;
    setMode("edit");
  }

  function commitEdit() {
    if (finished.current) return;
    finished.current = true;
    if (draft.trim() && draft.trim() !== list.name) onRename(draft);
    setMode("view");
  }

  function cancelEdit() {
    finished.current = true;
    setMode("view");
  }

  if (mode === "edit") {
    return (
      <div className="item-row editing">
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          maxLength={60}
          aria-label="Nuevo nombre de la lista"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") cancelEdit();
          }}
        />
      </div>
    );
  }

  if (mode === "confirm") {
    return (
      <div className="item-row confirming" onKeyDown={(e) => e.key === "Escape" && setMode("view")}>
        <span className="confirm-text" title="Sus canales volverán a quedar sin lista">
          ¿Borrar «{list.name}»?
        </span>
        <button className="confirm-yes" autoFocus onClick={onDelete}>
          Borrar
        </button>
        <button className="confirm-no" onClick={() => setMode("view")}>
          No
        </button>
      </div>
    );
  }

  return (
    <div className={`item-row ${active ? "active" : ""}`}>
      <button className="item" onClick={onSelect}>
        <span className="item-name">{list.name}</span>
        <span className="count">{list.channelIds.length}</span>
      </button>
      <span className="item-actions">
        <button title="Renombrar" aria-label={`Renombrar ${list.name}`} onClick={startEdit}>
          <PencilIcon />
        </button>
        <button title="Borrar" aria-label={`Borrar ${list.name}`} onClick={() => setMode("confirm")}>
          <TrashIcon />
        </button>
      </span>
    </div>
  );
}
