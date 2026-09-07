import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Zusätzliche Klasse auf dem Dialog-Panel */
  className?: string;
  /** X-Button oben rechts (Standard: an). Abbrechen bleibt über Backdrop/Escape. */
  showCloseButton?: boolean;
};

/**
 * Modal-Overlay (Portal auf `document.body`) mit Escape, Backdrop-Klick und Fokusfang.
 * Panel bleibt im Viewport; bei viel Inhalt scrollt der Body – Aktionsleisten bleiben erreichbar.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  className = "",
  showCloseButton = true,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);

    const body = bodyRef.current;
    const focusable = body?.querySelector<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    );
    (focusable ?? panelRef.current)?.focus();

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="modal-root" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Schließen" onClick={onClose} />
      <div
        ref={panelRef}
        className={`modal-panel ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={`modal-head${!showCloseButton ? " is-title-only" : ""}`}>
          <h3 id={titleId}>{title}</h3>
          {showCloseButton ? (
            <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Schließen">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>
        <div ref={bodyRef} className="modal-body">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
