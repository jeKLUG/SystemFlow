import type { FastifyRequest } from "fastify";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createId } from "./id.js";

export type SavedUpload = {
  id: string;
  filename: string;
  mimetype: string;
  bytesRead: number;
  storedName: string;
};

/**
 * Speichert die erste Datei aus einem Multipart-Request unter `uploadDir`.
 */
export async function saveFirstUpload(
  request: FastifyRequest,
  uploadDir: string,
  extraFields?: Record<string, string>,
): Promise<{ uploaded: SavedUpload | null; fields: Record<string, string> }> {
  const fields: Record<string, string> = { ...(extraFields ?? {}) };
  let uploaded: SavedUpload | null = null;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (uploaded) {
        part.file.resume();
        continue;
      }
      const id = createId("att");
      const safeName = part.filename.replace(/[^\w.\-()+\säöüÄÖÜß]/gi, "_").slice(0, 180);
      const storedName = `${id}_${safeName}`;
      const target = join(uploadDir, storedName);
      await pipeline(part.file, createWriteStream(target));
      if (part.file.truncated) {
        await unlink(target).catch(() => undefined);
        throw new Error("UPLOAD_ABORTED");
      }
      uploaded = {
        id,
        filename: part.filename,
        mimetype: part.mimetype || "application/octet-stream",
        bytesRead: Number(part.file.bytesRead || 0),
        storedName,
      };
    } else {
      fields[part.fieldname] = String(part.value ?? "").trim();
    }
  }

  return { uploaded, fields };
}
