import { useId } from "react";

/**
 * Hilfe-Kreis neben einer Überschrift; Text erscheint animiert beim Hover.
 */
export function HelpHint({ text }: { text: string }) {
  const tipId = useId();
  return (
    <span className="help-hint">
      <button type="button" className="help-hint-btn" aria-label="Hinweis" aria-describedby={tipId}>
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path
            d="M9.09 9C9.3251 8.33167 9.78915 7.76811 10.4 7.40913C11.0108 7.05016 11.7289 6.91894 12.4272 7.03871C13.1255 7.15849 13.7588 7.52152 14.2151 8.06353C14.6713 8.60553 14.9211 9.29152 14.92 10C14.92 12 11.92 13 11.92 13M12 17H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <span id={tipId} role="tooltip" className="help-hint-tip">
        {text}
      </span>
    </span>
  );
}
