import { Checkbox } from "./Checkbox";

export type MailNotifyItem = {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

/**
 * Umschaltbare Ereignis-Liste für E-Mail-Benachrichtigungen.
 */
export function MailNotifyList({ items }: { items: MailNotifyItem[] }) {
  return (
    <ul className="mail-notify-list">
      {items.map((item) => (
        <li key={item.id}>
          <div className="mail-notify-copy">
            <strong>{item.label}</strong>
            {item.hint ? <p className="muted">{item.hint}</p> : null}
          </div>
          <Checkbox checked={item.checked} onChange={item.onChange} label={item.checked ? "an" : "aus"} />
        </li>
      ))}
    </ul>
  );
}
