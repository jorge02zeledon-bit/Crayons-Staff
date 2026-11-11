import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Sessions are signed cookies (no session table). AUTH_SECRET signs them; set a
 * long random value in Vercel. Development falls back to a fixed secret.
 *
 * - cs_session: a staff member (teacher or admin) who signed in with their PIN.
 * - cs_kiosk:   a tablet unlocked with KIOSK_PASSWORD (or ADMIN_PASSWORD) so it can
 *               clock people in and out by badge for 90 days.
 */
export const SESSION_COOKIE = "cs_session";
export const KIOSK_COOKIE = "cs_kiosk";
const SESSION_DAYS = 30;
const KIOSK_DAYS = 90;

export type Session = { teacherId: string; role: "teacher" | "admin"; exp: number };

function secret(): string | null {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  return process.env.NODE_ENV === "production" ? null : "development-only-secret";
}
export function authConfigured(): boolean { return !!secret(); }

function sign(payload: string): string {
  const s = secret();
  if (!s) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", s).update(payload).digest("base64url");
}
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function b64(s: string): string { return Buffer.from(s, "utf8").toString("base64url"); }
function unb64(s: string): string { return Buffer.from(s, "base64url").toString("utf8"); }

export function issueSession(teacherId: string, role: Session["role"], now = Date.now()): { value: string; maxAge: number } {
  const payload = b64(JSON.stringify({ teacherId, role, exp: now + SESSION_DAYS * 86400_000 }));
  return { value: `${payload}.${sign(payload)}`, maxAge: SESSION_DAYS * 86400 };
}

export function verifySession(value: string | undefined, now = Date.now()): Session | null {
  if (!value || !secret()) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const s = JSON.parse(unb64(payload)) as Session;
    if (!s.teacherId || !s.exp || s.exp < now) return null;
    return s;
  } catch {
    return null;
  }
}

export function issueKiosk(now = Date.now()): { value: string; maxAge: number } {
  const exp = String(now + KIOSK_DAYS * 86400_000);
  return { value: `${exp}.${sign("kiosk:" + exp)}`, maxAge: KIOSK_DAYS * 86400 };
}
export function verifyKiosk(value: string | undefined, now = Date.now()): boolean {
  if (!value || !secret()) return false;
  const [exp, sig] = value.split(".");
  return !!exp && !!sig && Number(exp) > now && safeEqual(sig, sign("kiosk:" + exp));
}

export function kioskPasswordConfigured(): boolean {
  return !!(process.env.KIOSK_PASSWORD || process.env.ADMIN_PASSWORD);
}
export function checkKioskPassword(input: string): boolean {
  const p = process.env.KIOSK_PASSWORD || process.env.ADMIN_PASSWORD;
  return !!p && safeEqual(input, p);
}
export function checkMasterPassword(input: string): boolean {
  const p = process.env.ADMIN_PASSWORD;
  return !!p && safeEqual(input, p);
}

/** Badge codes go on QR cards. Short, unambiguous characters only. */
export function newBadgeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
