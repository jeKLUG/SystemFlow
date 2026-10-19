/** CSS-Klasse für das Staff-Hell-Theme (Marke www.systemhaus-ess.de). */
export const STAFF_LIGHT_CLASS = "theme-light";

/**
 * True, wenn die Staff-Shell aktiv ist.
 * Portale auf `document.body` erben Tokens von `html.theme-light`.
 */
export function isStaffLightTheme(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.documentElement.classList.contains(STAFF_LIGHT_CLASS) ||
    Boolean(document.querySelector(".app-shell.theme-light"))
  );
}
