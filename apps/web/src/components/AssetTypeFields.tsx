import { Checkbox } from "./Checkbox";
import {
  assetFieldGroupTitle,
  groupedFieldsForKind,
  type AssetFieldId,
  type AssetFieldSpec,
} from "../lib/assetFields";
import type { AssetKind } from "../types";

export type AssetTypeFormValues = Record<Exclude<AssetFieldId, "portalVisible">, string> & {
  portalVisible: boolean;
};

/**
 * Typabhängige Inventar-Felder (PC ≠ Firewall ≠ Lizenz).
 */
export function AssetTypeFields({
  kind,
  values,
  onChange,
}: {
  kind: AssetKind;
  values: AssetTypeFormValues;
  onChange: (id: AssetFieldId, value: string | boolean) => void;
}) {
  const groups = groupedFieldsForKind(kind);

  return (
    <>
      {groups.map((group) => (
        <section key={group.group} className="asset-form-block">
          <h4>{assetFieldGroupTitle(group.group)}</h4>
          <div className="asset-form-grid">
            {group.fields.map((field) => (
              <AssetFieldControl
                key={field.id}
                field={field}
                values={values}
                onChange={onChange}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function AssetFieldControl({
  field,
  values,
  onChange,
}: {
  field: AssetFieldSpec;
  values: AssetTypeFormValues;
  onChange: (id: AssetFieldId, value: string | boolean) => void;
}) {
  if (field.id === "portalVisible") {
    return (
      <div className="asset-form-span-2">
        <Checkbox
          label={field.label}
          checked={values.portalVisible}
          onChange={(checked) => onChange("portalVisible", checked)}
        />
      </div>
    );
  }

  const span = field.span2 ? " asset-form-span-2" : "";
  const value = values[field.id] ?? "";

  return (
    <label className={`field${span}`}>
      <span>{field.label}</span>
      {field.input === "textarea" ? (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
        />
      ) : (
        <input
          type={field.input === "number" ? "number" : field.input === "date" ? "date" : "text"}
          min={field.input === "number" ? 0 : undefined}
          step={field.input === "number" ? "any" : undefined}
          value={value}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
        />
      )}
    </label>
  );
}
