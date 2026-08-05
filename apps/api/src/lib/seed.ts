import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { users } from "../db/schema.js";
import { createId } from "./id.js";

/**
 * Stellt sicher, dass der Admin-Benutzer existiert (aus Env).
 */
export async function ensureAdmin(
  db: Db,
  username: string,
  password: string,
): Promise<void> {
  const existing = await db.select().from(users).where(eq(users.username, username)).get();
  const passwordHash = await bcrypt.hash(password, 12);

  if (!existing) {
    await db.insert(users).values({
      id: createId("usr"),
      username,
      passwordHash,
      createdAt: new Date(),
    });
    return;
  }

  await db.update(users).set({ passwordHash }).where(eq(users.id, existing.id));
}
