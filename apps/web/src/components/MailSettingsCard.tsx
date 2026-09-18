import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { HelpHint } from "./HelpHint";
import { MailNotifyList } from "./MailNotifyList";
import { Modal } from "./Modal";
import { PasswordField } from "./PasswordField";
import {
  mailCustomerKinds,
  mailKindLabel,
  mailStaffKinds,
  type MailCustomerKind,
  type MailNotifyConfig,
  type MailSettings,
  type SmtpSecure,
} from "../types";

type SmtpForm = {
  smtpHost: string;
  smtpPort: string;
  smtpSecure: SmtpSecure;
  smtpUser: string;
  smtpPassword: string;
  mailFromEmail: string;
  mailFromName: string;
  mailReplyTo: string;
  mailPublicUrl: string;
  mailStaffInbox: string;
};

type MailEdit = "smtp" | "staff" | "customer" | null;

const smtpSecureLabel: Record<SmtpSecure, string> = {
  starttls: "STARTTLS",
  ssl: "SSL/TLS",
  none: "Unverschlüsselt",
};

function emptyNotify(): MailNotifyConfig {
  return {
    staff: Object.fromEntries(mailStaffKinds.map((k) => [k, true])) as MailNotifyConfig["staff"],
    customer: Object.fromEntries(mailCustomerKinds.map((k) => [k, true])) as MailNotifyConfig["customer"],
    reminders: { hours24: true, hours1: true, morning: false },
  };
}

function cloneNotify(n: MailNotifyConfig): MailNotifyConfig {
  return {
    staff: { ...n.staff },
    customer: { ...n.customer },
    reminders: { ...n.reminders },
  };
}

function enabledCount(values: Record<string, boolean>): number {
  return Object.values(values).filter(Boolean).length;
}

function reminderChips(r: MailNotifyConfig["reminders"]): string[] {
  return [
    r.hours24 ? "24h" : null,
    r.hours1 ? "1h" : null,
    r.morning ? "08:00" : null,
  ].filter((v): v is string => Boolean(v));
}

function emptySmtp(): SmtpForm {
  return {
    smtpHost: "",
    smtpPort: "587",
    smtpSecure: "starttls",
    smtpUser: "",
    smtpPassword: "",
    mailFromEmail: "",
    mailFromName: "",
    mailReplyTo: "",
    mailPublicUrl: "",
    mailStaffInbox: "",
  };
}

/**
 * SMTP und Ereignis-Typen: Übersicht eingeklappt, Bearbeitung im Dialog.
 */
export function MailSettingsCard() {
  const [form, setForm] = useState<SmtpForm>(emptySmtp);
  const [notify, setNotify] = useState<MailNotifyConfig>(emptyNotify);
  const [smtpDraft, setSmtpDraft] = useState<SmtpForm>(emptySmtp);
  const [notifyDraft, setNotifyDraft] = useState<MailNotifyConfig>(emptyNotify);
  const [passwordSet, setPasswordSet] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [edit, setEdit] = useState<MailEdit>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    void api
      .mailSettings()
      .then((s: MailSettings) => {
        const next = {
          smtpHost: s.smtpHost,
          smtpPort: String(s.smtpPort || 587),
          smtpSecure: s.smtpSecure,
          smtpUser: s.smtpUser,
          smtpPassword: "",
          mailFromEmail: s.mailFromEmail,
          mailFromName: s.mailFromName,
          mailReplyTo: s.mailReplyTo,
          mailPublicUrl: s.mailPublicUrl,
          mailStaffInbox: s.mailStaffInbox,
        };
        setForm(next);
        setNotify(s.notify);
        setPasswordSet(s.smtpPasswordSet);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Laden fehlgeschlagen"))
      .finally(() => setLoaded(true));
  }, []);

  function patchDraft<K extends keyof SmtpForm>(key: K, value: SmtpForm[K]) {
    setSmtpDraft((f) => ({ ...f, [key]: value }));
  }

  function openEdit(next: MailEdit) {
    setErr("");
    setMsg("");
    if (next === "smtp") {
      setSmtpDraft({ ...form, smtpPassword: "" });
      setShowPass(false);
    } else if (next) {
      setNotifyDraft(cloneNotify(notify));
    }
    setEdit(next);
  }

  async function persist(nextForm: SmtpForm, nextNotify: MailNotifyConfig) {
    const updated = await api.updateMailSettings({
      smtpHost: nextForm.smtpHost,
      smtpPort: Number(nextForm.smtpPort) || 587,
      smtpSecure: nextForm.smtpSecure,
      smtpUser: nextForm.smtpUser,
      smtpPassword: nextForm.smtpPassword || undefined,
      mailFromEmail: nextForm.mailFromEmail,
      mailFromName: nextForm.mailFromName,
      mailReplyTo: nextForm.mailReplyTo,
      mailPublicUrl: nextForm.mailPublicUrl,
      mailStaffInbox: nextForm.mailStaffInbox,
      notify: nextNotify,
    });
    setPasswordSet(updated.smtpPasswordSet);
    setForm({ ...nextForm, smtpPassword: "" });
    setNotify(cloneNotify(nextNotify));
    setMsg("E-Mail-Einstellungen gespeichert.");
  }

  async function saveSmtp(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy("save");
    try {
      await persist(smtpDraft, notify);
      setEdit(null);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy("");
    }
  }

  async function saveNotify(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy("save");
    try {
      await persist(form, notifyDraft);
      setEdit(null);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy("");
    }
  }

  async function test() {
    setErr("");
    setMsg("");
    setBusy("test");
    try {
      await api.testMailSettings();
      setMsg("Testmail gesendet.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Test fehlgeschlagen");
    } finally {
      setBusy("");
    }
  }

  const smtpReady = Boolean(form.smtpHost.trim() && form.mailFromEmail.trim() && form.mailStaffInbox.trim());
  const staffOn = enabledCount(notify.staff);
  const customerOn = enabledCount(notify.customer);
  const reminders = reminderChips(notify.reminders);
  const smtpMeta = [
    form.smtpHost || null,
    form.smtpHost ? `${smtpSecureLabel[form.smtpSecure]} · ${form.smtpPort}` : null,
    form.mailFromEmail ? `Absender ${form.mailFromEmail}` : null,
    form.mailStaffInbox ? `Staff ${form.mailStaffInbox}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="panel settings-card settings-card-mail">
      <header className="settings-card-head">
        <div>
          <p className="eyebrow">Benachrichtigungen</p>
          <div className="page-head-title">
            <h3>E-Mail</h3>
            <HelpHint text="SMTP in der Datenbank (Passwort verschlüsselt). Staff bekommt Mails an die Sammeladresse, Kunden an die Adresse am Portal-Zugang. Bearbeitung jeweils im Dialog." />
          </div>
        </div>
      </header>
      {!loaded ? (
        <p className="muted">Lade…</p>
      ) : (
        <ul className="mail-config-list">
          <li className={`mail-config-row${smtpReady ? " is-on" : " is-off"}`}>
            <span className={`mon-dot${smtpReady ? " is-on" : " is-off"}`} aria-hidden />
            <div className="mail-config-copy">
              <strong>SMTP</strong>
              <p className="muted">
                {smtpReady ? smtpMeta : "Host, Absender und Staff-Adresse fehlen"}
                {smtpReady && passwordSet ? " · Passwort gesetzt" : ""}
              </p>
            </div>
            <div className="mail-config-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={Boolean(busy) || !smtpReady}
                onClick={() => void test()}
              >
                {busy === "test" ? "…" : "Test"}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openEdit("smtp")}>
                Bearbeiten
              </button>
            </div>
          </li>
          <li className={`mail-config-row${staffOn > 0 ? " is-on" : " is-off"}`}>
            <span className={`mon-dot${staffOn > 0 ? " is-on" : " is-off"}`} aria-hidden />
            <div className="mail-config-copy">
              <strong>Staff</strong>
              <p className="muted">
                {staffOn === 0
                  ? "Keine Mails"
                  : `${staffOn}/${mailStaffKinds.length} Typen${reminders.length ? ` · Erinnerung ${reminders.join(", ")}` : ""}`}
              </p>
            </div>
            <div className="mail-config-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openEdit("staff")}>
                Bearbeiten
              </button>
            </div>
          </li>
          <li className={`mail-config-row${customerOn > 0 ? " is-on" : " is-off"}`}>
            <span className={`mon-dot${customerOn > 0 ? " is-on" : " is-off"}`} aria-hidden />
            <div className="mail-config-copy">
              <strong>Kunden</strong>
              <p className="muted">
                {customerOn === 0
                  ? "Keine Mails"
                  : `${customerOn}/${mailCustomerKinds.length} Typen · Opt-out am Portal-Konto`}
              </p>
            </div>
            <div className="mail-config-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openEdit("customer")}>
                Bearbeiten
              </button>
            </div>
          </li>
        </ul>
      )}
      {err ? <p className="form-error">{err}</p> : null}
      {msg ? <p className="form-success">{msg}</p> : null}

      <Modal
        open={edit === "smtp"}
        title="SMTP einrichten"
        onClose={() => {
          if (!busy) setEdit(null);
        }}
        className="modal-wide modal-mail"
      >
        <form className="mail-settings-form" onSubmit={(e) => void saveSmtp(e)}>
          <label className="field">
            <span>SMTP-Host</span>
            <input
              value={smtpDraft.smtpHost}
              onChange={(e) => patchDraft("smtpHost", e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>Port</span>
            <input
              type="number"
              min={1}
              max={65535}
              value={smtpDraft.smtpPort}
              onChange={(e) => patchDraft("smtpPort", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Verschlüsselung</span>
            <select
              value={smtpDraft.smtpSecure}
              onChange={(e) => patchDraft("smtpSecure", e.target.value as SmtpSecure)}
            >
              <option value="starttls">STARTTLS (587)</option>
              <option value="ssl">SSL/TLS (465)</option>
              <option value="none">Unverschlüsselt</option>
            </select>
          </label>
          <label className="field">
            <span>SMTP-Benutzer</span>
            <input
              value={smtpDraft.smtpUser}
              onChange={(e) => patchDraft("smtpUser", e.target.value)}
              autoComplete="off"
            />
          </label>
          <PasswordField
            label={passwordSet ? "SMTP-Passwort (leer = unverändert)" : "SMTP-Passwort"}
            value={smtpDraft.smtpPassword}
            onChange={(v) => patchDraft("smtpPassword", v)}
            revealed={showPass}
            onToggleReveal={() => setShowPass((v) => !v)}
            autoComplete="new-password"
          />
          <label className="field">
            <span>Absender-Adresse</span>
            <input
              type="email"
              value={smtpDraft.mailFromEmail}
              onChange={(e) => patchDraft("mailFromEmail", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Absendername</span>
            <input
              value={smtpDraft.mailFromName}
              onChange={(e) => patchDraft("mailFromName", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Reply-To</span>
            <input
              type="email"
              value={smtpDraft.mailReplyTo}
              onChange={(e) => patchDraft("mailReplyTo", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Staff-Sammeladresse</span>
            <input
              type="email"
              value={smtpDraft.mailStaffInbox}
              onChange={(e) => patchDraft("mailStaffInbox", e.target.value)}
            />
          </label>
          <label className="field mail-settings-span">
            <span>Öffentliche App-URL</span>
            <input
              placeholder="https://app.example.de"
              value={smtpDraft.mailPublicUrl}
              onChange={(e) => patchDraft("mailPublicUrl", e.target.value)}
            />
          </label>
          <div className="mail-settings-actions modal-actions">
            <button className="btn btn-primary" type="submit" disabled={Boolean(busy)}>
              {busy === "save" ? "Speichert…" : "Speichern"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => setEdit(null)}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={edit === "staff"}
        title="Staff-Benachrichtigungen"
        onClose={() => {
          if (!busy) setEdit(null);
        }}
        className="modal-mail"
      >
        <form onSubmit={(e) => void saveNotify(e)}>
          <p className="mail-modal-lead muted">
            Mails gehen an die Staff-Sammeladresse. Ausgeschaltete Typen werden nicht versendet.
          </p>
          <MailNotifyList
            items={mailStaffKinds.map((kind) => ({
              id: kind,
              label: mailKindLabel[kind],
              checked: notifyDraft.staff[kind],
              onChange: (checked) =>
                setNotifyDraft((n) => ({ ...n, staff: { ...n.staff, [kind]: checked } })),
            }))}
          />
          <h4 className="mail-settings-sub">Termin-Erinnerung</h4>
          <MailNotifyList
            items={[
              {
                id: "hours24",
                label: "24 Stunden vorher",
                checked: notifyDraft.reminders.hours24,
                onChange: (checked) =>
                  setNotifyDraft((n) => ({ ...n, reminders: { ...n.reminders, hours24: checked } })),
              },
              {
                id: "hours1",
                label: "1 Stunde vorher",
                checked: notifyDraft.reminders.hours1,
                onChange: (checked) =>
                  setNotifyDraft((n) => ({ ...n, reminders: { ...n.reminders, hours1: checked } })),
              },
              {
                id: "morning",
                label: "Am Termin-Tag 08:00",
                checked: notifyDraft.reminders.morning,
                onChange: (checked) =>
                  setNotifyDraft((n) => ({ ...n, reminders: { ...n.reminders, morning: checked } })),
              },
            ]}
          />
          <div className="mail-settings-actions modal-actions">
            <button className="btn btn-primary" type="submit" disabled={Boolean(busy)}>
              {busy === "save" ? "Speichert…" : "Speichern"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => setEdit(null)}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={edit === "customer"}
        title="Kunden-Benachrichtigungen"
        onClose={() => {
          if (!busy) setEdit(null);
        }}
        className="modal-mail"
      >
        <form onSubmit={(e) => void saveNotify(e)}>
          <p className="mail-modal-lead muted">
            Globale Vorgabe. Kunden können erlaubte Typen am Portal-Konto zusätzlich abschalten.
          </p>
          <MailNotifyList
            items={mailCustomerKinds.map((kind) => ({
              id: kind,
              label: mailKindLabel[kind],
              checked: notifyDraft.customer[kind as MailCustomerKind],
              onChange: (checked) =>
                setNotifyDraft((n) => ({
                  ...n,
                  customer: { ...n.customer, [kind]: checked },
                })),
            }))}
          />
          <div className="mail-settings-actions modal-actions">
            <button className="btn btn-primary" type="submit" disabled={Boolean(busy)}>
              {busy === "save" ? "Speichert…" : "Speichern"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => setEdit(null)}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
