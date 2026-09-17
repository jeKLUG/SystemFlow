import type { InputHTMLAttributes } from "react";
import { EyeIcon, EyeOffIcon } from "./Icons";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  revealed: boolean;
  onToggleReveal: () => void;
  hint?: string;
};

/**
 * Passwortfeld mit Umschalter zum Anzeigen/Verbergen.
 */
export function PasswordField({
  label,
  value,
  onChange,
  revealed,
  onToggleReveal,
  hint,
  ...rest
}: Props) {
  const shown = revealed;
  return (
    <label className="field">
      <span>{label}</span>
      <div className="password-field">
        <input
          {...rest}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <button
          type="button"
          className="password-field-toggle"
          onClick={onToggleReveal}
          title={shown ? "Passwort verbergen" : "Passwort anzeigen"}
          aria-label={shown ? "Passwort verbergen" : "Passwort anzeigen"}
          aria-pressed={shown}
        >
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {hint ? <span className="field-hint muted">{hint}</span> : null}
    </label>
  );
}

/**
 * Hinweis, ob neues Passwort und Wiederholung übereinstimmen.
 */
export function PasswordMatchHint({ value, confirm }: { value: string; confirm: string }) {
  if (!value && !confirm) return null;
  if (!confirm) {
    return <p className="password-match muted">Zur Kontrolle bitte wiederholen.</p>;
  }
  if (value !== confirm) {
    return <p className="password-match is-bad">Die Passwörter stimmen nicht überein.</p>;
  }
  return <p className="password-match is-ok">Passwörter stimmen überein.</p>;
}
