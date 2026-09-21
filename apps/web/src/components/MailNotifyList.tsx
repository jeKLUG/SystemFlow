import type { ReactNode } from "react";
import type { MailCustomerKind, MailNotifyConfig } from "../types";
import {
  mailGroupCounts,
  mailKindHint,
  mailKindShortLabel,
  mailNotifyGroups,
  mailReminderOptions,
  type MailNotifyGroupId,
  type MailReminderKey,
} from "../lib/mailNotify";

type Props = {
  values: Record<MailCustomerKind, boolean>;
  allowed?: Record<MailCustomerKind, boolean>;
  /** Ohne Callback nur Anzeige. */
  onChange?: (kind: MailCustomerKind, checked: boolean) => void;
  /** Global ausgeschaltete Typen ausblenden (Portal). */
  hideDisallowed?: boolean;
  reminders?: {
    values: MailNotifyConfig["reminders"];
    onChange?: (key: MailReminderKey, checked: boolean) => void;
  };
};

const groupIcons: Record<MailNotifyGroupId, ReactNode> = {
  tickets: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4.5 8.5h15v9a2 2 0 01-2 2h-11a2 2 0 01-2-2v-9Z" />
      <path d="M8 8.5V6.5A2.5 2.5 0 0110.5 4h3A2.5 2.5 0 0116 6.5v2" />
      <path d="M8.5 13h7M8.5 16h4" strokeLinecap="round" />
    </svg>
  ),
  appointments: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M8 3.5V7M16 3.5V7M3.5 10h17" />
    </svg>
  ),
  monitoring: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
      <path d="M8 20h8M12 16.5V20" strokeLinecap="round" />
      <path d="M7 12.5l3-3 2.5 2.5 4-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

function Toggle({
  checked,
  disabled,
  mixed,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  mixed?: boolean;
  label: string;
  onChange?: (checked: boolean) => void;
}) {
  if (!onChange) {
    return (
      <span className={`mail-notify-state${checked ? " is-on" : ""}`}>{checked ? "an" : "aus"}</span>
    );
  }
  return (
    <label
      className={`mail-toggle${checked ? " is-on" : ""}${mixed ? " is-mixed" : ""}${disabled ? " is-disabled" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-checked={mixed ? "mixed" : checked}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="mail-toggle-track" aria-hidden />
    </label>
  );
}

/**
 * Benachrichtigungen nach Tickets, Terminen und Monitoring. Ohne `onChange` nur Anzeige.
 */
export function MailNotifyList({ values, allowed, onChange, hideDisallowed, reminders }: Props) {
  return (
    <div className="mail-notify-board">
      {mailNotifyGroups.map((group) => {
        const kinds = group.kinds.filter((kind) => {
          if (hideDisallowed && allowed && !allowed[kind]) return false;
          return true;
        });
        if (!kinds.length) return null;
        const { on, total } = mailGroupCounts(values, { ...group, kinds });
        const allOn = kinds.every((kind) => values[kind]);
        const mixed = on > 0 && on < total;

        return (
          <section
            key={group.id}
            className={`mail-notify-group${on === 0 ? " is-empty" : ""}`}
            aria-labelledby={`mail-group-${group.id}`}
          >
            <header className="mail-notify-group-head">
              <span className="mail-notify-group-icon">{groupIcons[group.id]}</span>
              <div className="mail-notify-group-copy">
                <h4 id={`mail-group-${group.id}`}>{group.title}</h4>
                <p className="muted">
                  {on === 0 ? "Keine Mails" : on === total ? "Alle an" : `${on} von ${total} an`}
                </p>
              </div>
              {onChange ? (
                <Toggle
                  checked={allOn}
                  mixed={mixed}
                  label={`Alle ${group.title}-Mails`}
                  onChange={(checked) => {
                    for (const kind of kinds) onChange?.(kind, checked);
                  }}
                />
              ) : null}
            </header>
            <ul className="mail-notify-rows">
              {kinds.map((kind) => {
                const blocked = Boolean(allowed && !allowed[kind]);
                const checked = Boolean(values[kind]);
                return (
                  <li key={kind} className={!checked ? "is-off" : undefined}>
                    <div className="mail-notify-row">
                      <div className="mail-notify-copy">
                        <strong>{mailKindShortLabel[kind]}</strong>
                        <p className="muted">{blocked ? "Global aus – wird nicht versendet" : mailKindHint[kind]}</p>
                      </div>
                      <Toggle
                        checked={checked}
                        label={mailKindShortLabel[kind]}
                        onChange={onChange ? (next) => onChange(kind, next) : undefined}
                      />
                    </div>
                    {kind === "appointmentReminder" && reminders && checked ? (
                      <ReminderChips values={reminders.values} onChange={reminders.onChange} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ReminderChips({
  values,
  onChange,
}: {
  values: MailNotifyConfig["reminders"];
  onChange?: (key: MailReminderKey, checked: boolean) => void;
}) {
  const anyOn = mailReminderOptions.some((opt) => values[opt.id]);
  return (
    <div className="mail-notify-extra">
      <p className="mail-notify-extra-label">Wann erinnern?</p>
      <div className="mail-notify-chips" role="group" aria-label="Erinnerungszeitpunkte">
        {mailReminderOptions.map((opt) => {
          const on = values[opt.id];
          if (!onChange) {
            return (
              <span key={opt.id} className={`mail-notify-chip${on ? " is-on" : ""}`}>
                {opt.label}
              </span>
            );
          }
          return (
            <button
              key={opt.id}
              type="button"
              className={`mail-notify-chip${on ? " is-on" : ""}`}
              aria-pressed={on}
              onClick={() => onChange(opt.id, !on)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {!anyOn ? <p className="mail-notify-warn">Keine Uhrzeit – es geht keine Erinnerung raus.</p> : null}
    </div>
  );
}
