import type { FastifyReply, FastifyRequest } from "fastify";

declare module "@fastify/secure-session" {
  interface SessionData {
    userId?: string;
    username?: string;
  }
}

/**
 * Prüft, ob eine gültige Session vorhanden ist.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.session.get("userId");
  if (!userId) {
    return reply.code(401).send({ error: "Nicht angemeldet" });
  }
}
