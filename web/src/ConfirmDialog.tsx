import { useEffect, useRef } from "react";

interface Props {
  title: string;
  message: string;
  /** Botón que ejecuta la acción (se pinta como peligroso). */
  confirmLabel: string;
  /** Botón por defecto: es el que tiene el foco al abrirse, para que un Enter sin querer cancele. */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Diálogo de confirmación con "Cancelar" marcado por defecto. Esc o clic fuera también cancelan. */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel = "Cancelar", onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // onCancel suele ser una función nueva en cada render: se guarda en una ref para que el efecto
  // (y con él el foco inicial) se ejecute una sola vez y no se reinicie si la app se redibuja.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    // Al cerrar, el foco vuelve a donde estaba (p. ej. el botón que abrió el diálogo).
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  // El foco se queda dentro del diálogo: con dos botones, Tab y Mayús+Tab alternan entre ellos.
  function trapFocus(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    (document.activeElement === cancelRef.current ? confirmRef : cancelRef).current?.focus();
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapFocus}
      >
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        <div className="dialog-actions">
          <button ref={cancelRef} className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button ref={confirmRef} className="btn danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
