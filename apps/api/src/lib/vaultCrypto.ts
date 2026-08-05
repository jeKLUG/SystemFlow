import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

/** scrypt-Parameter: bewusst konservativ (CPU-Kosten gegen Brute-Force). */
export const VAULT_SCRYPT = {
  N: 16384,
  r: 8,
  p: 1,
  keyLen: 32,
  maxmem: 64 * 1024 * 1024,
} as const;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });
}

const CANARY = Buffer.from("systemhaus-vault-v1", "utf8");

export type EncryptedBlob = {
  /** base64: iv(12) || tag(16) || ciphertext */
  v: 1;
  data: string;
};

/**
 * Leitet einen 256-Bit-Schlüssel aus der Vault-Passphrase ab (scrypt).
 */
export async function deriveKek(passphrase: string, salt: Buffer): Promise<Buffer> {
  const key = (await scryptAsync(passphrase, salt, VAULT_SCRYPT.keyLen, {
    N: VAULT_SCRYPT.N,
    r: VAULT_SCRYPT.r,
    p: VAULT_SCRYPT.p,
    maxmem: VAULT_SCRYPT.maxmem,
  })) as Buffer;
  return key;
}

/**
 * Verschlüsselt Bytes mit AES-256-GCM.
 */
export function encryptBytes(key: Buffer, plaintext: Buffer): EncryptedBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    data: Buffer.concat([iv, tag, ciphertext]).toString("base64"),
  };
}

/**
 * Entschlüsselt AES-256-GCM-Blob. Wirft bei falschem Schlüssel/Manipulation.
 */
export function decryptBytes(key: Buffer, blob: EncryptedBlob | string): Buffer {
  const data = typeof blob === "string" ? blob : blob.data;
  const raw = Buffer.from(data, "base64");
  if (raw.length < 12 + 16 + 1) throw new Error("Ungültige Ciphertexte");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptText(key: Buffer, text: string): string {
  return encryptBytes(key, Buffer.from(text, "utf8")).data;
}

export function decryptText(key: Buffer, data: string): string {
  return decryptBytes(key, data).toString("utf8");
}

export type VaultMetaPayload = {
  saltB64: string;
  wrappedDekB64: string;
  canaryB64: string;
  kdf: typeof VAULT_SCRYPT;
};

/**
 * Erzeugt neues Vault: zufälliger DEK, mit Passphrase gewrappt.
 */
export async function setupVault(passphrase: string): Promise<{
  meta: VaultMetaPayload;
  dek: Buffer;
}> {
  const salt = randomBytes(16);
  const dek = randomBytes(32);
  const kek = await deriveKek(passphrase, salt);
  const wrappedDekB64 = encryptBytes(kek, dek).data;
  const canaryB64 = encryptBytes(dek, CANARY).data;
  // KEK aus Speicher möglichst schnell verwerfen
  kek.fill(0);
  return {
    meta: {
      saltB64: salt.toString("base64"),
      wrappedDekB64,
      canaryB64,
      kdf: VAULT_SCRYPT,
    },
    dek,
  };
}

/**
 * Entsperrt das Vault und liefert den DEK. Bei falscher Passphrase: null.
 */
export async function unlockVault(
  passphrase: string,
  meta: VaultMetaPayload,
): Promise<Buffer | null> {
  const salt = Buffer.from(meta.saltB64, "base64");
  const kek = await deriveKek(passphrase, salt);
  try {
    const dek = decryptBytes(kek, meta.wrappedDekB64);
    const canary = decryptBytes(dek, meta.canaryB64);
    if (canary.length !== CANARY.length || !timingSafeEqual(canary, CANARY)) {
      dek.fill(0);
      return null;
    }
    return dek;
  } catch {
    return null;
  } finally {
    kek.fill(0);
  }
}

/**
 * Wrappt vorhandenen DEK mit neuer Passphrase (Passphrase wechseln).
 */
export async function rewrapDek(dek: Buffer, newPassphrase: string): Promise<VaultMetaPayload> {
  const salt = randomBytes(16);
  const kek = await deriveKek(newPassphrase, salt);
  try {
    return {
      saltB64: salt.toString("base64"),
      wrappedDekB64: encryptBytes(kek, dek).data,
      canaryB64: encryptBytes(dek, CANARY).data,
      kdf: VAULT_SCRYPT,
    };
  } finally {
    kek.fill(0);
  }
}

/** Sicheres Löschen eines Buffers (best effort). */
export function wipe(buf: Buffer | null | undefined) {
  if (buf) buf.fill(0);
}
