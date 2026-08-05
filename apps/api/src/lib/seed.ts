import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { users } from "../db/schema.js";
import { createId } from "./id.js";

/**
 * Stellt sicher, dass der Admin-Benutzer existiert.
 * Passwort aus Env nur beim ersten Anlegen – nicht bei jedem Restart überschreiben.
 */
export async function ensureAdmin(
  db: Db,
  username: string,
  password: string,
): Promise<void> {
  const existing = await db.select().from(users).where(eq(users.username, username)).get();

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 12);
    await db.insert(users).values({
      id: createId("usr"),
      username,
      passwordHash,
      createdAt: new Date(),
    });
    return;
  }

  // Optionaler Force-Reset nur wenn explizit gesetzt
  if (process.env.ADMIN_PASSWORD_FORCE === "1") {
    const passwordHash = await bcrypt.hash(password, 12);
    await db.update(users).set({ passwordHash }).where(eq(users.id, existing.id));
  }
}
