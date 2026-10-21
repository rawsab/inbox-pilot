import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  createDb,
  owners,
  ownerSessions,
} from "@inbox-pilot/db";
import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "./env.js";

type Db = ReturnType<typeof createDb>["db"];

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export async function ensureOwner(db: Db) {
  const existing = await db.select().from(owners).limit(1);
  if (existing[0]) return existing[0];
  const salt = randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${hashPassword(env().ownerPassword, salt)}`;
  const [owner] = await db
    .insert(owners)
    .values({ email: "owner@localhost.test", passwordHash })
    .returning();
  return owner!;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = hashPassword(password, salt);
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(next, "hex"));
  } catch {
    return false;
  }
}

export async function login(
  db: Db,
  password: string,
): Promise<{ token: string; csrf: string } | null> {
  const owner = await ensureOwner(db);
  if (!verifyPassword(password, owner.passwordHash)) return null;
  const token = randomBytes(32).toString("base64url");
  const csrf = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 86_400_000);
  await db.insert(ownerSessions).values({
    ownerId: owner.id,
    tokenHash,
    csrfSecret: csrf,
    expiresAt,
  });
  return { token, csrf };
}

export type Session = {
  ownerId: string;
  csrf: string;
};

export async function resolveSession(
  db: Db,
  req: FastifyRequest,
): Promise<Session | null> {
  const cookie = (req.cookies as Record<string, string | undefined> | undefined)
    ?.inbox_session;
  if (!cookie) return null;
  const tokenHash = createHash("sha256").update(cookie).digest("hex");
  const rows = await db
    .select()
    .from(ownerSessions)
    .where(eq(ownerSessions.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return { ownerId: row.ownerId, csrf: row.csrfSecret };
}

export async function requireOwner(
  db: Db,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<Session | null> {
  const session = await resolveSession(db, req);
  if (!session) {
    await reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  return session;
}

export function requireCsrf(req: FastifyRequest, session: Session): boolean {
  const header = req.headers["x-csrf-token"];
  return typeof header === "string" && header === session.csrf;
}
