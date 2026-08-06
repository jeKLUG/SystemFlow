import { useId, type InputHTMLAttributes, type ReactNode } from "react";

type BaseProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange" | "checked" | "children"
> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Text neben der Checkbox */
  label?: ReactNode;
  className?: string;
};

type FieldProps = BaseProps & {
  /** Beschriftung oberhalb (Formularfeld) */
  fieldLabel: string;
};

type InlineProps = BaseProps & {
  fieldLabel?: undefined;
};

/**
 * Einheitliche Plattform-Checkbox – als Formularfeld (`fieldLabel`) oder inline.
 */
export function Checkbox(props: FieldProps | InlineProps) {
  const { checked, onChange, label, className = "", fieldLabel, disabled, id, ...rest } = props;
  const autoId = useId();
  const inputId = id ?? autoId;

  const control = (
    <label
      className={`check ${checked ? "is-checked" : ""} ${disabled ? "is-disabled" : ""} ${className}`.trim()}
      htmlFor={inputId}
    >
      <input
        {...rest}
        id={inputId}
        type="checkbox"
        className="check-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="check-box" aria-hidden>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {label != null && label !== "" ? <span className="check-text">{label}</span> : null}
    </label>
  );

  if (fieldLabel) {
    return (
      <div className="field checkbox-field">
        <span className="checkbox-field-label">{fieldLabel}</span>
        {control}
      </div>
    );
  }

  return control;
}
