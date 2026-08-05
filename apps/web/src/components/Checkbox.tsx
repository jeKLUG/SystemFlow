import type { InputHTMLAttributes, ReactNode } from "react";

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
 * Einheitliche Checkbox – als Formularfeld (`fieldLabel`) oder inline mit Label.
 */
export function Checkbox(props: FieldProps | InlineProps) {
  const { checked, onChange, label, className = "", fieldLabel, disabled, id, ...rest } = props;
  const control = (
    <label className={`check ${disabled ? "is-disabled" : ""} ${className}`.trim()}>
      <input
        {...rest}
        id={id}
        type="checkbox"
        className="check-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="check-box" aria-hidden />
      {label != null && label !== "" ? <span className="check-text">{label}</span> : null}
    </label>
  );

  if (fieldLabel) {
    return (
      <div className="field checkbox-field">
        <span>{fieldLabel}</span>
        {control}
      </div>
    );
  }

  return control;
}
