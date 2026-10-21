import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function keyFromEnv(hexKey: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(hexKey, "hex");
}

/** AES-256-GCM encrypt; returns `iv:tag:ciphertext` hex. */
export function encryptSecret(plaintext: string, hexKey: string): string {
  const key = keyFromEnv(hexKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(payload: string, hexKey: string): string {
  const key = keyFromEnv(hexKey);
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("invalid_encrypted_payload");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
