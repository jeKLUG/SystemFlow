import type { FileKind } from "../lib/files";

/**
 * Ordner-Icon für die Datei-Ablage-Kacheln.
 */
export function FolderGlyph() {
  return (
    <svg viewBox="0 0 48 40" fill="none" aria-hidden>
      <path
        d="M2 10.5C2 8 4 6 6.5 6h9.2l2.8 3.2H41.5C44 9.2 46 11.2 46 13.7V32c0 2.5-2 4.5-4.5 4.5h-35C4 36.5 2 34.5 2 32V10.5Z"
        fill="#d97706"
        opacity="0.55"
      />
      <path d="M2 15h44v17c0 2.5-2 4.5-4.5 4.5h-35C4 36.5 2 34.5 2 32V15Z" fill="#f59e0b" />
      <path d="M2 15h44v2.2H2V15Z" fill="#fbbf24" opacity="0.7" />
    </svg>
  );
}

/**
 * Dateityp-Icon für Ablage-Kacheln.
 */
export function FileGlyph({ kind }: { kind: FileKind }) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    "aria-hidden": true as const,
  };
  if (kind === "pdf") {
    return (
      <svg {...props}>
        <path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" />
        <path d="M14 3v5h5M9 14h6M9 17h4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "office") {
    return (
      <svg {...props}>
        <path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" />
        <path d="M14 3v5h5M9 13h6M9 16h6M9 19h3" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "archive") {
    return (
      <svg {...props}>
        <path d="M4 7h16v12H4zM8 7V5h8v2" strokeLinejoin="round" />
        <path d="M12 11v4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "text") {
    return (
      <svg {...props}>
        <path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" />
        <path d="M14 3v5h5M9 13h6M9 16h6M9 19h4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" />
      <path d="M14 3v5h5" strokeLinecap="round" />
    </svg>
  );
}
