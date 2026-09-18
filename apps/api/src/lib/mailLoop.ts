import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { appointments, type Appointment } from "../db/schema.js";
import { APP_TIMEZONE, nowTime, todayIso, zonedLocalToUtcMs } from "./dates.js";
import { loadMailPublic, mailReady } from "./mail.js";
import { notifyAppointmentReminder } from "./notify.js";

const LOOP_MS = 60_000;

type SentMap = { hours24?: string; hours1?: string; morning?: string };

function parseSent(raw: string | null | undefined): SentMap {
  if (!raw?.trim()) return {};
  try {
    return JSON.parse(raw) as SentMap;
  } catch {
    return {};
  }
}

function appointmentStartMs(apt: Appointment): number {
  if (apt.allDay || !apt.startTime) {
    return zonedLocalToUtcMs(apt.startDate, "08:00");
  }
  return zonedLocalToUtcMs(apt.startDate, apt.startTime);
}

/**
 * Versendet fällige Termin-Erinnerungen (24h, 1h, morgens 08:00).
 */
export async function processAppointmentReminders(db: Db): Promise<void> {
  const settings = await loadMailPublic(db);
  if (!mailReady(settings)) return;
  const { hours24, hours1, morning } = settings.notify.reminders;
  if (!hours24 && !hours1 && !morning) return;

  const today = todayIso();
  const now = Date.now();
  const rows = await db.select().from(appointments).all();
  for (const apt of rows) {
    const end = apt.endDate || apt.startDate;
    if (end < today) continue;
    const start = appointmentStartMs(apt);
    if (!Number.isFinite(start) || start <= now) continue;
    const sent = parseSent(apt.remindersSentJson);
    let changed = false;

    if (hours1 && !sent.hours1 && now >= start - 60 * 60 * 1000) {
      await notifyAppointmentReminder(db, apt, "hours1");
      const iso = new Date().toISOString();
      sent.hours1 = iso;
      if (!sent.hours24) sent.hours24 = iso;
      changed = true;
    } else if (hours24 && !sent.hours24 && now >= start - 24 * 60 * 60 * 1000) {
      await notifyAppointmentReminder(db, apt, "hours24");
      sent.hours24 = new Date().toISOString();
      changed = true;
    }

    if (morning && !sent.morning && apt.startDate === today && nowTime(APP_TIMEZONE) >= "08:00") {
      await notifyAppointmentReminder(db, apt, "morning");
      sent.morning = new Date().toISOString();
      changed = true;
    }

    if (changed) {
      await db
        .update(appointments)
        .set({ remindersSentJson: JSON.stringify(sent), updatedAt: new Date() })
        .where(eq(appointments.id, apt.id));
    }
  }
}

/**
 * Prüft regelmäßig Termin-Erinnerungen.
 */
export function startMailLoop(db: Db): void {
  const tick = async () => {
    try {
      await processAppointmentReminders(db);
    } catch (err) {
      console.error("Mail-Loop:", err);
    }
  };
  void tick();
  setInterval(() => void tick(), LOOP_MS);
}
