import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { customerUsers, customers, type AuthRole } from "../db/schema.js";

declare module "@fastify/secure-session" {
  interface SessionData {
    userId?: string;
    username?: string;
    rememberMe?: string;
    role?: AuthRole;
    customerId?: string;
  }
}

export type PortalContext = {
  userId: string;
  username: string;
  customerId: string;
};

declare module "fastify" {
  interface FastifyRequest {
    portal?: PortalContext;
  }
}

/**
 * Staff-Session: Admin. Kunden-Sessions werden abgewiesen.
 * Bestehende Sessions ohne `role` gelten als Admin (Kompatibilität).
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.session.get("userId");
  if (!userId) {
    return reply.code(401).send({ error: "Nicht angemeldet" });
  }
  const role = request.session.get("role");
  if (role === "customer") {
    return reply.code(403).send({ error: "Keine Berechtigung" });
  }
}

/** Alias: alle bestehenden Staff-Routen bleiben geschützt. */
export const requireAuth = requireAdmin;

/**
 * Portal-Session: aktiver Kunde mit freigeschaltetem Login.
 */
export function requirePortal(db: Db) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.session.get("userId");
    const role = request.session.get("role");
    const customerId = request.session.get("customerId");
    if (!userId || role !== "customer" || !customerId) {
      return reply.code(401).send({ error: "Nicht angemeldet" });
    }

    const portalUser = await db
      .select()
      .from(customerUsers)
      .where(and(eq(customerUsers.id, userId), eq(customerUsers.customerId, customerId)))
      .get();
    if (!portalUser || !portalUser.enabled) {
      return reply.code(401).send({ error: "Zugang deaktiviert" });
    }

    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer || customer.status !== "active" || customer.kind !== "customer") {
      return reply.code(401).send({ error: "Zugang deaktiviert" });
    }

    request.portal = {
      userId: portalUser.id,
      username: portalUser.username,
      customerId: customer.id,
    };
  };
}

export const SESSION_LONG_SEC = 60 * 60 * 24 * 30;
export const SESSION_SHORT_SEC = 60 * 60 * 12;

/**
 * Setzt Session-Cookie und Sliding-TTL analog zum bestehenden Staff-Login.
 */
export function applySessionTtl(request: FastifyRequest, rememberMe: boolean) {
  request.session.options({
    maxAge: rememberMe ? SESSION_LONG_SEC : SESSION_SHORT_SEC,
  });
}
