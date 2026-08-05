import type { FastifyInstance } from "fastify";
import { getTemplate, listTemplates } from "../lib/templates.js";
import { requireAuth } from "../plugins/auth.js";

/**
 * Registriert Routen für Dokumentvorlagen.
 */
export async function templateRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/templates", async () => listTemplates().map(({ content: _c, ...meta }) => meta));

  app.get("/api/templates/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const template = getTemplate(id);
    if (!template) return reply.code(404).send({ error: "Vorlage nicht gefunden" });
    return template;
  });
}
